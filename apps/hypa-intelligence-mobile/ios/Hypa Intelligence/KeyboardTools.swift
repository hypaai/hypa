import UIKit

enum KeyboardTool: String, CaseIterable {
  case translate = "TRANSLATE"
  case voice = "VOICE"
  case speak = "SPEAK"
  case dictionary = "DICTIONARY"
  case clipboard = "CLIPBOARD"
  case textEditing = "TEXT_EDITING"
  case languages = "LANGUAGES"
  case emoji = "EMOJI"
  case settings = "SETTINGS"

  static let toolbarCount = 4

  var label: String {
    switch self {
    case .translate: return "Translate"
    case .voice: return "Transcribe"
    case .speak: return "Speak"
    case .dictionary: return "Dictionary"
    case .clipboard: return "Clipboard"
    case .textEditing: return "Editing"
    case .languages: return "Languages"
    case .emoji: return "Emoji"
    case .settings: return "Settings"
    }
  }

  var iconKey: String {
    switch self {
    case .translate: return "mode-translate"
    case .voice: return "mode-mic"
    case .speak: return "mode-tts"
    case .dictionary: return "mode-dictionary"
    case .clipboard: return "mode-clipboard"
    case .textEditing: return "mode-text-editing"
    case .languages: return "mode-languages"
    case .emoji: return "mode-emoji"
    case .settings: return "mode-settings"
    }
  }

  static func tool(forIconKey key: String) -> KeyboardTool? {
    allCases.first { $0.iconKey == key }
  }
}

enum KeyboardToolOrder {
  static func load() -> [KeyboardTool] {
    let defaults = keyboardSharedDefaults(reason: "loadToolOrder").defaults
    let raw = defaults.string(forKey: prefsKey) ?? defaultSettingsJson()
    guard let data = raw.data(using: .utf8),
      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return KeyboardTool.allCases }
    return parse(obj["toolOrder"])
  }

  static func parse(_ raw: Any?) -> [KeyboardTool] {
    var stored: [KeyboardTool] = []
    for entry in raw as? [Any] ?? [] {
      guard let name = entry as? String,
        let tool = KeyboardTool(
          rawValue: name.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()),
        !stored.contains(tool)
      else { continue }
      stored.append(tool)
    }
    return stored + KeyboardTool.allCases.filter { !stored.contains($0) }
  }

  static func persist(_ order: [KeyboardTool]) {
    let defaults = keyboardSharedDefaults(reason: "persistToolOrder").defaults
    let raw = defaults.string(forKey: prefsKey) ?? defaultSettingsJson()
    guard let data = raw.data(using: .utf8),
      var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    obj["toolOrder"] = order.map { $0.rawValue }
    guard let updated = try? JSONSerialization.data(withJSONObject: obj),
      let json = String(data: updated, encoding: .utf8)
    else { return }
    defaults.set(json, forKey: prefsKey)
    defaults.synchronize()
  }
}

final class ToolsPanelView: UIScrollView {
  private static let columns = KeyboardTool.toolbarCount
  private static let tileHeight: CGFloat = 76
  private static let rowSpacing: CGFloat = 12
  private static let topInset: CGFloat = 14
  private static let sideInset: CGFloat = 8

  private let theme: KeyboardTheme
  private let fontSize: CGFloat
  private let isActive: (KeyboardTool) -> Bool
  private let onActivate: (KeyboardTool) -> Void
  private let onOrderChanged: ([KeyboardTool]) -> Void
  private let onOrderCommitted: ([KeyboardTool]) -> Void

  private var order: [KeyboardTool]
  private var tiles: [KeyboardTool: ToolTileView] = [:]
  private var draggingTool: KeyboardTool?
  private let separator = UIView()

  init(
    theme: KeyboardTheme,
    fontSize: CGFloat,
    order: [KeyboardTool],
    longPressDuration: TimeInterval,
    image: (KeyboardTool) -> UIImage?,
    isActive: @escaping (KeyboardTool) -> Bool,
    onActivate: @escaping (KeyboardTool) -> Void,
    onOrderChanged: @escaping ([KeyboardTool]) -> Void,
    onOrderCommitted: @escaping ([KeyboardTool]) -> Void
  ) {
    self.theme = theme
    self.fontSize = fontSize
    self.order = order
    self.isActive = isActive
    self.onActivate = onActivate
    self.onOrderChanged = onOrderChanged
    self.onOrderCommitted = onOrderCommitted
    super.init(frame: .zero)

    backgroundColor = UIColor.black.withAlphaComponent(0.01)
    alwaysBounceVertical = false
    showsVerticalScrollIndicator = true
    contentInsetAdjustmentBehavior = .never
    separator.isUserInteractionEnabled = false
    separator.backgroundColor = theme.label.withAlphaComponent(0.12)
    addSubview(separator)
    for tool in KeyboardTool.allCases {
      let tile = ToolTileView(
        tool: tool, image: image(tool), theme: theme, fontSize: fontSize,
        isActive: isActive(tool))
      tiles[tool] = tile
      addSubview(tile)
    }

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    addGestureRecognizer(tap)
    let hold = UILongPressGestureRecognizer(target: self, action: #selector(handleHold(_:)))
    hold.minimumPressDuration = longPressDuration
    addGestureRecognizer(hold)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let rows = (order.count + Self.columns - 1) / Self.columns
    let contentHeight = Self.topInset + CGFloat(rows) * Self.tileHeight
      + CGFloat(max(0, rows - 1)) * Self.rowSpacing + Self.sideInset
    let size = CGSize(width: bounds.width, height: max(bounds.height, contentHeight))
    if contentSize != size { contentSize = size }
    separator.frame = CGRect(
      x: Self.sideInset, y: 0, width: max(0, bounds.width - 2 * Self.sideInset), height: 1)
    for (index, tool) in order.enumerated() {
      tiles[tool]?.frame = frameForSlot(index)
    }
  }

  private func frameForSlot(_ index: Int) -> CGRect {
    let columnWidth = (bounds.width - 2 * Self.sideInset) / CGFloat(Self.columns)
    let row = CGFloat(index / Self.columns)
    let column = CGFloat(index % Self.columns)
    return CGRect(
      x: Self.sideInset + column * columnWidth,
      y: Self.topInset + row * (Self.tileHeight + Self.rowSpacing),
      width: columnWidth,
      height: Self.tileHeight)
  }

  private func slot(at point: CGPoint) -> Int? {
    guard bounds.width > 0 else { return nil }
    let columnWidth = (bounds.width - 2 * Self.sideInset) / CGFloat(Self.columns)
    let column = Int((point.x - Self.sideInset) / columnWidth)
    let row = Int(max(0, point.y - Self.topInset) / (Self.tileHeight + Self.rowSpacing))
    let index = row * Self.columns + min(max(column, 0), Self.columns - 1)
    return min(max(index, 0), order.count - 1)
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard draggingTool == nil, let index = slot(at: recognizer.location(in: self)) else { return }
    onActivate(order[index])
  }

  @objc private func handleHold(_ recognizer: UILongPressGestureRecognizer) {
    let point = recognizer.location(in: self)
    switch recognizer.state {
    case .began:
      guard let index = slot(at: point) else { return }
      isScrollEnabled = false
      draggingTool = order[index]
      tiles[order[index]]?.alpha = 0.4
    case .changed:
      guard let tool = draggingTool, let to = slot(at: point),
        let from = order.firstIndex(of: tool), from != to
      else { return }
      order.remove(at: from)
      order.insert(tool, at: to)
      onOrderChanged(order)
      setNeedsLayout()
      UIView.animate(withDuration: 0.12) { self.layoutIfNeeded() }
    case .ended, .cancelled, .failed:
      guard let tool = draggingTool else { return }
      tiles[tool]?.alpha = 1
      draggingTool = nil
      isScrollEnabled = true
      onOrderCommitted(order)
    default:
      break
    }
  }
}

private final class ToolTileView: UIView {
  init(tool: KeyboardTool, image: UIImage?, theme: KeyboardTheme, fontSize: CGFloat, isActive: Bool)
  {
    super.init(frame: .zero)
    isUserInteractionEnabled = false
    accessibilityLabel = tool.label

    let circle = UIView()
    circle.translatesAutoresizingMaskIntoConstraints = false
    circle.applyKeyAesthetics(
      background: isActive ? theme.accent : theme.key, cornerRadius: 24,
      tint: KeySurface.glyphTint)
    addSubview(circle)

    let icon = UIImageView(image: image)
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.contentMode = .scaleAspectFit
    icon.tintColor = isActive ? .white : theme.label
    circle.addSubview(icon)

    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = tool.label
    label.textColor = theme.label
    label.font = .systemFont(ofSize: max(fontSize - 8, 10), weight: .medium)
    label.textAlignment = .center
    addSubview(label)

    NSLayoutConstraint.activate([
      circle.centerXAnchor.constraint(equalTo: centerXAnchor),
      circle.topAnchor.constraint(equalTo: topAnchor),
      circle.widthAnchor.constraint(equalToConstant: 48),
      circle.heightAnchor.constraint(equalToConstant: 48),
      icon.centerXAnchor.constraint(equalTo: circle.centerXAnchor),
      icon.centerYAnchor.constraint(equalTo: circle.centerYAnchor),
      icon.widthAnchor.constraint(equalToConstant: 22),
      icon.heightAnchor.constraint(equalToConstant: 22),
      label.topAnchor.constraint(equalTo: circle.bottomAnchor, constant: 6),
      label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 2),
      label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -2),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
