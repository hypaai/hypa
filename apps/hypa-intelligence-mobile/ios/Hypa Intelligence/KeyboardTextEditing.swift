import UIKit

enum TextEditingAction: Equatable {
  case moveLeft, moveRight, moveUp, moveDown
  case select(Int)
  case jumpStart, jumpEnd
  case backspace
  case selectAllOrCut, copy, paste
}

final class TextEditingPanelView: UIView {
  private let theme: KeyboardTheme
  private let fontSize: CGFloat
  private let hasText: Bool
  private let hasSelection: Bool
  private let hasClipboardContent: Bool
  private let onAction: (TextEditingAction) -> Void

  private var actionTimer: Timer?
  private var currentHoldAction: TextEditingAction?

  private var leftBtn: UIView!
  private var rightBtn: UIView!
  private var upBtn: UIView!
  private var downBtn: UIView!
  private var cutBtn: UIView!
  private var cutLabel: UILabel!
  private var copyBtn: UIView!
  private var pasteBtn: UIView!
  private var jumpStartBtn: UIView!
  private var jumpEndBtn: UIView!
  private var bsBtn: UIView!
  private var selectBtn: UIView!

  private var selectTapCount = 0
  private var selectTapTimer: Timer?
  private static let selectTapWindow: TimeInterval = 0.35

  init(
    theme: KeyboardTheme,
    fontSize: CGFloat,
    hasText: Bool,
    hasSelection: Bool,
    hasClipboardContent: Bool,
    onAction: @escaping (TextEditingAction) -> Void
  ) {
    self.theme = theme
    self.fontSize = fontSize
    self.hasText = hasText
    self.hasSelection = hasSelection
    self.hasClipboardContent = hasClipboardContent
    self.onAction = onAction
    super.init(frame: .zero)
    self.backgroundColor = theme.surface

    buildGrid()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    actionTimer?.invalidate()
    selectTapTimer?.invalidate()
  }

  private func buildGrid() {
    let root = UIStackView()
    root.axis = .vertical
    root.spacing = 8
    root.distribution = .fill
    root.translatesAutoresizingMaskIntoConstraints = false
    addSubview(root)
    NSLayoutConstraint.activate([
      root.topAnchor.constraint(equalTo: topAnchor, constant: 4),
      root.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
      root.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
      root.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
    ])

    let mainRow = UIStackView()
    mainRow.axis = .horizontal
    mainRow.spacing = 6
    mainRow.distribution = .fill

    leftBtn = makeButton(icon: "arrow.left", action: .moveLeft, isRepeatable: true, enabled: hasText)
    mainRow.addArrangedSubview(leftBtn)

    let centerCol = UIStackView()
    centerCol.axis = .vertical
    centerCol.spacing = 6
    centerCol.distribution = .fillEqually
    upBtn = makeButton(icon: "arrow.up", action: .moveUp, isRepeatable: true, enabled: hasText)
    selectBtn = makeSelectButton(enabled: hasText)
    downBtn = makeButton(icon: "arrow.down", action: .moveDown, isRepeatable: true, enabled: hasText)
    centerCol.addArrangedSubview(upBtn)
    centerCol.addArrangedSubview(selectBtn)
    centerCol.addArrangedSubview(downBtn)
    mainRow.addArrangedSubview(centerCol)

    rightBtn = makeButton(icon: "arrow.right", action: .moveRight, isRepeatable: true, enabled: hasText)
    mainRow.addArrangedSubview(rightBtn)

    let actionCol = UIStackView()
    actionCol.axis = .vertical
    actionCol.spacing = 6
    actionCol.distribution = .fillEqually
    cutBtn = makeButton(title: hasSelection ? "Cut" : "Select all", action: .selectAllOrCut, isRepeatable: false, enabled: hasText || hasSelection)
    copyBtn = makeButton(title: "Copy", action: .copy, isRepeatable: false, enabled: hasSelection)
    pasteBtn = makeButton(title: "Paste", action: .paste, isRepeatable: false, enabled: hasClipboardContent)
    actionCol.addArrangedSubview(cutBtn)
    actionCol.addArrangedSubview(copyBtn)
    actionCol.addArrangedSubview(pasteBtn)
    mainRow.addArrangedSubview(actionCol)

    let bottomRow = UIStackView()
    bottomRow.axis = .horizontal
    bottomRow.spacing = 6
    bottomRow.distribution = .fillEqually
    jumpStartBtn = makeButton(title: "|<", action: .jumpStart, isRepeatable: false, enabled: hasText)
    jumpEndBtn = makeButton(title: ">|", action: .jumpEnd, isRepeatable: false, enabled: hasText)
    bsBtn = makeButton(icon: "delete.left", action: .backspace, isRepeatable: true, enabled: hasText || hasSelection)
    bottomRow.addArrangedSubview(jumpStartBtn)
    bottomRow.addArrangedSubview(jumpEndBtn)
    bottomRow.addArrangedSubview(bsBtn)

    root.addArrangedSubview(mainRow)
    root.addArrangedSubview(bottomRow)

    NSLayoutConstraint.activate([
      leftBtn.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.21),
      centerCol.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.255),
      rightBtn.widthAnchor.constraint(equalTo: widthAnchor, multiplier: 0.21),

      bottomRow.heightAnchor.constraint(equalTo: root.heightAnchor, multiplier: 0.25)
    ])
  }

  private func makeSelectButton(enabled: Bool) -> UIView {
    let btn = TextEditingButton(action: nil)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(background: theme.key, pressedColor: theme.keyPressed)
    btn.isUserInteractionEnabled = enabled
    btn.alpha = enabled ? 1.0 : 0.4

    let lbl = UILabel()
    lbl.text = "Select"
    lbl.font = .systemFont(ofSize: 14)
    lbl.textColor = theme.label
    lbl.textAlignment = .center
    lbl.translatesAutoresizingMaskIntoConstraints = false
    btn.addSubview(lbl)
    NSLayoutConstraint.activate([
      lbl.centerXAnchor.constraint(equalTo: btn.centerXAnchor),
      lbl.centerYAnchor.constraint(equalTo: btn.centerYAnchor),
    ])

    btn.onTrigger = { [weak self] in self?.registerSelectTap() }
    return btn
  }

  private func registerSelectTap() {
    selectTapCount += 1
    selectTapTimer?.invalidate()
    selectTapTimer = Timer.scheduledTimer(
      withTimeInterval: Self.selectTapWindow, repeats: false
    ) { [weak self] _ in
      guard let self else { return }
      let count = min(self.selectTapCount, 3)
      self.selectTapCount = 0
      self.selectTapTimer = nil
      self.onAction(.select(count))
    }
  }

  func update(hasText: Bool, hasSelection: Bool, hasClipboardContent: Bool, isSelecting: Bool = false) {
    let updateBtn = { (btn: UIView, enabled: Bool) in
      btn.isUserInteractionEnabled = enabled
      btn.alpha = enabled ? 1.0 : 0.4
    }

    updateBtn(leftBtn, hasText)
    updateBtn(rightBtn, hasText)
    updateBtn(upBtn, hasText)
    updateBtn(downBtn, hasText)
    updateBtn(jumpStartBtn, hasText)
    updateBtn(jumpEndBtn, hasText)
    updateBtn(bsBtn, hasText || hasSelection)

    updateBtn(cutBtn, hasSelection)
    if let label = cutLabel { label.text = hasSelection ? "Cut" : "Select all" }
    cutBtn.isUserInteractionEnabled = hasText || hasSelection
    cutBtn.alpha = (hasText || hasSelection) ? 1.0 : 0.4
    updateBtn(selectBtn, hasText)
    selectBtn.backgroundColor = isSelecting ? theme.accent : theme.key
    updateBtn(copyBtn, hasSelection)
    updateBtn(pasteBtn, hasClipboardContent)
  }

  private func makeButton(title: String? = nil, icon: String? = nil, action: TextEditingAction?, isRepeatable: Bool, enabled: Bool) -> UIView {
    let btn = TextEditingButton(action: action)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(background: theme.key, pressedColor: theme.keyPressed)
    btn.isUserInteractionEnabled = enabled
    btn.alpha = enabled ? 1.0 : 0.4

    if let t = title {
      let lbl = UILabel()
      lbl.text = t
      lbl.font = .systemFont(ofSize: 14)
      lbl.textColor = theme.label
      lbl.textAlignment = .center
      lbl.translatesAutoresizingMaskIntoConstraints = false
      btn.addSubview(lbl)
      if title == "Cut" || title == "Select all" { cutLabel = lbl }
      NSLayoutConstraint.activate([
        lbl.centerXAnchor.constraint(equalTo: btn.centerXAnchor),
        lbl.centerYAnchor.constraint(equalTo: btn.centerYAnchor)
      ])
    } else if let ic = icon, let img = UIImage(systemName: ic) {
      let iv = UIImageView(image: img)
      iv.tintColor = theme.label
      iv.contentMode = .scaleAspectFit
      iv.translatesAutoresizingMaskIntoConstraints = false
      btn.addSubview(iv)
      NSLayoutConstraint.activate([
        iv.centerXAnchor.constraint(equalTo: btn.centerXAnchor),
        iv.centerYAnchor.constraint(equalTo: btn.centerYAnchor),
        iv.widthAnchor.constraint(equalToConstant: 20),
        iv.heightAnchor.constraint(equalToConstant: 20)
      ])
    }

    if let a = action {
      btn.onTrigger = { [weak self] in
        self?.onAction(a)
      }
      if isRepeatable {
        btn.onStartRepeat = { [weak self] in
          self?.startRepeatTimer(action: a)
        }
        btn.onStopRepeat = { [weak self] in
          self?.stopRepeatTimer()
        }
      }
    }

    return btn
  }

  private func startRepeatTimer(action: TextEditingAction) {
    stopRepeatTimer()
    currentHoldAction = action
    actionTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      guard let a = self?.currentHoldAction else { return }
      self?.onAction(a)
    }
    actionTimer?.fireDate = Date().addingTimeInterval(0.3)
  }

  private func stopRepeatTimer() {
    actionTimer?.invalidate()
    actionTimer = nil
    currentHoldAction = nil
  }
}

private final class TextEditingButton: UIControl {
  let action: TextEditingAction?
  var onTrigger: (() -> Void)?
  var onStartRepeat: (() -> Void)?
  var onStopRepeat: (() -> Void)?

  init(action: TextEditingAction?) {
    self.action = action
    super.init(frame: .zero)
    addTarget(self, action: #selector(touchDown), for: .touchDown)
    addTarget(self, action: #selector(touchUp), for: [.touchUpInside, .touchUpOutside, .touchCancel])
  }
  required init?(coder: NSCoder) { fatalError() }

  @objc private func touchDown() {
    onStartRepeat?()
    onTrigger?()
  }
  @objc private func touchUp() {
    onStopRepeat?()
  }
}
