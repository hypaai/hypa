import UIKit

func pixelSnap(_ value: CGFloat, scale: CGFloat) -> CGFloat {
  guard scale > 0 else { return value }
  return (value * scale).rounded() / scale
}

func pixelSnap(_ rect: CGRect, scale: CGFloat) -> CGRect {
  CGRect(
    x: pixelSnap(rect.origin.x, scale: scale),
    y: pixelSnap(rect.origin.y, scale: scale),
    width: pixelSnap(rect.width, scale: scale),
    height: pixelSnap(rect.height, scale: scale))
}

enum KeySurface {
  static let keyRadius: CGFloat = 10
  static let controlRadius: CGFloat = 12
  static let cardRadius: CGFloat = 16

  static let textTint: CGFloat = 0.8
  static let glyphTint: CGFloat = 0.92

  static var supportsGlass: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
  }

  fileprivate static let fillTag = 8801
  fileprivate static let glassTag = 8802
  fileprivate static let pressTag = 8803
}

final class KeySurfaceFillView: UIView {
  override func layoutSubviews() {
    super.layoutSubviews()
    superview?.sendKeySurfaceToBack()
  }
}

func makeGlassBackdrop(tint: UIColor, cornerRadius: CGFloat) -> UIVisualEffectView? {
  guard #available(iOS 26.0, *) else { return nil }
  let effect = UIGlassEffect(style: .regular)
  effect.tintColor = tint
  let backdrop = UIVisualEffectView(effect: effect)
  backdrop.isUserInteractionEnabled = false
  backdrop.clipsToBounds = true
  backdrop.layer.cornerRadius = cornerRadius
  return backdrop
}

extension UIView {
  func applyKeyAesthetics(
    background: UIColor,
    cornerRadius: CGFloat = KeySurface.keyRadius,
    tint: CGFloat = KeySurface.textTint,
    pressedColor: UIColor? = nil
  ) {
    backgroundColor = .clear
    layer.masksToBounds = false
    layer.cornerRadius = cornerRadius

    if background == .clear {
      [KeySurface.fillTag, KeySurface.glassTag]
        .compactMap { surfaceLayer($0) }
        .forEach { $0.removeFromSuperview() }
      layer.shadowOpacity = 0
      if let pressedColor, let control = self as? UIControl {
        applyPressFeedback(color: pressedColor, cornerRadius: cornerRadius, on: control)
      }
      return
    }

    let fillView = existingOrNewSurfaceLayer(tag: KeySurface.fillTag) { KeySurfaceFillView() }
    fillView.layer.cornerRadius = cornerRadius

    if #available(iOS 26.0, *) {
      let glass =
        existingOrNewSurfaceLayer(tag: KeySurface.glassTag) {
          let view = UIVisualEffectView()
          view.clipsToBounds = true
          return view
        } as? UIVisualEffectView
      let effect = UIGlassEffect(style: .regular)
      effect.tintColor = background.withAlphaComponent(tint)
      glass?.effect = effect
      glass?.layer.cornerRadius = cornerRadius
      fillView.backgroundColor = .clear
      layer.shadowOpacity = 0
    } else {
      fillView.backgroundColor = background
      layer.shadowColor = UIColor.black.cgColor
      layer.shadowOpacity = 0.35
      layer.shadowOffset = CGSize(width: 0, height: 1)
      layer.shadowRadius = 0.5
    }

    guard let pressedColor, let control = self as? UIControl else { return }
    applyPressFeedback(color: pressedColor, cornerRadius: cornerRadius, on: control)
  }

  private func applyPressFeedback(color: UIColor, cornerRadius: CGFloat, on control: UIControl) {
    let existing = surfaceLayer(KeySurface.pressTag)
    let overlay = existing ?? makeSurfaceLayer(tag: KeySurface.pressTag, view: KeySurfaceFillView())
    overlay.layer.cornerRadius = cornerRadius
    overlay.backgroundColor = color.withAlphaComponent(0.55)
    overlay.isHidden = true

    guard existing == nil else { return }
    control.addTarget(
      self, action: #selector(UIView.showKeySurfacePress),
      for: [.touchDown, .touchDownRepeat, .touchDragEnter])
    control.addTarget(
      self, action: #selector(UIView.hideKeySurfacePress),
      for: [.touchUpInside, .touchUpOutside, .touchCancel, .touchDragExit])
  }

  @objc fileprivate func showKeySurfacePress() {
    surfaceLayer(KeySurface.pressTag)?.isHidden = false
  }

  @objc fileprivate func hideKeySurfacePress() {
    surfaceLayer(KeySurface.pressTag)?.isHidden = true
  }

  func sendKeySurfaceToBack() {
    let layers = [KeySurface.fillTag, KeySurface.glassTag, KeySurface.pressTag]
      .compactMap { surfaceLayer($0) }
    guard !layers.isEmpty, Array(subviews.prefix(layers.count)) != layers else { return }
    layers.reversed().forEach { sendSubviewToBack($0) }
  }

  private func surfaceLayer(_ tag: Int) -> UIView? {
    subviews.first { $0.tag == tag }
  }

  private func existingOrNewSurfaceLayer(tag: Int, build: () -> UIView) -> UIView {
    if let existing = surfaceLayer(tag) { return existing }
    return makeSurfaceLayer(tag: tag, view: build())
  }

  private func makeSurfaceLayer(tag: Int, view: UIView) -> UIView {
    view.tag = tag
    view.isUserInteractionEnabled = false
    view.translatesAutoresizingMaskIntoConstraints = false
    let depth = [KeySurface.fillTag, KeySurface.glassTag, KeySurface.pressTag]
      .filter { surfaceLayer($0) != nil }
      .count
    insertSubview(view, at: depth)
    NSLayoutConstraint.activate([
      view.topAnchor.constraint(equalTo: topAnchor),
      view.bottomAnchor.constraint(equalTo: bottomAnchor),
      view.leadingAnchor.constraint(equalTo: leadingAnchor),
      view.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
    return view
  }
}

final class PaddingLabel: UILabel {
  var contentInsets = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)

  override func drawText(in rect: CGRect) {
    super.drawText(in: rect.inset(by: contentInsets))
  }

  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(
      width: size.width + contentInsets.left + contentInsets.right,
      height: size.height + contentInsets.top + contentInsets.bottom)
  }
}

final class WaveformView: UIView {
  private var bars: [UIView] = []
  private var barConstraints: [NSLayoutConstraint] = []
  private var displayLink: CADisplayLink?
  private var lastFrameTime: CFTimeInterval = 0
  private let barMaxHeight: CGFloat
  var usesAnimatedWaveform = true

  init(barCount: Int = 9, barMaxHeight: CGFloat = 18, color: UIColor) {
    self.barMaxHeight = barMaxHeight
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 3
    stack.distribution = .fillEqually
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor),
      stack.topAnchor.constraint(equalTo: topAnchor),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    for _ in 0..<barCount {
      let bar = UIView()
      bar.translatesAutoresizingMaskIntoConstraints = false
      bar.backgroundColor = color
      bar.layer.cornerRadius = 2
      stack.addArrangedSubview(bar)
      let height = bar.heightAnchor.constraint(equalToConstant: barMaxHeight * 0.4)
      height.isActive = true
      barConstraints.append(height)
      bars.append(bar)
    }
    setStaticWaveform()
  }

  required init?(coder: NSCoder) {
    barMaxHeight = 18
    super.init(coder: coder)
  }

  deinit { stopAnimating() }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    displayLink?.isPaused = window == nil
  }

  func setColor(_ color: UIColor) {
    bars.forEach { $0.backgroundColor = color }
  }

  func setAnimating(_ isAnimating: Bool) {
    if isAnimating && usesAnimatedWaveform {
      startAnimating()
    } else {
      stopAnimating()
      setStaticWaveform()
    }
  }

  private func startAnimating() {
    stopAnimating()
    lastFrameTime = 0
    let link = CADisplayLink(target: self, selector: #selector(handleDisplayLink(_:)))
    link.add(to: .main, forMode: .common)
    link.isPaused = window == nil
    displayLink = link
  }

  private func stopAnimating() {
    displayLink?.invalidate()
    displayLink = nil
    lastFrameTime = 0
  }

  @objc private func handleDisplayLink(_ link: CADisplayLink) {
    guard lastFrameTime == 0 || link.timestamp - lastFrameTime >= 0.18 else { return }
    lastFrameTime = link.timestamp
    barConstraints.forEach { $0.constant = CGFloat.random(in: 4...barMaxHeight) }
    layoutIfNeeded()
  }

  private func setStaticWaveform() {
    let profile: [CGFloat] = [0.2, 0.35, 0.55, 0.8, 0.6, 0.45, 0.7, 0.4, 0.25]
    for (index, constraint) in barConstraints.enumerated() {
      constraint.constant = max(4, barMaxHeight * profile[index % profile.count])
    }
    layoutIfNeeded()
  }
}
protocol KeyHostViewDelegate: AnyObject {
  func keyHost(_ host: KeyHostView, didPressDown key: KeyButton)
  func keyHost(_ host: KeyHostView, didBeginHold key: KeyButton, at point: CGPoint) -> Bool
  func keyHost(_ host: KeyHostView, didMoveHold key: KeyButton, to point: CGPoint)
  func keyHost(
    _ host: KeyHostView, didPressUp key: KeyButton, at point: CGPoint, held: Bool, cancelled: Bool)
}

final class KeyHostView: UIView {
  weak var touchDelegate: KeyHostViewDelegate?
  var holdDuration: TimeInterval = 0.5
  var holdMovementTolerance: CGFloat = 12

  private final class Press {
    let key: KeyButton
    let origin: CGPoint
    var isHolding = false
    var canHold = true
    init(key: KeyButton, origin: CGPoint) {
      self.key = key
      self.origin = origin
    }
  }

  private var presses: [ObjectIdentifier: Press] = [:]

  private var keys: [KeyButton] = []

  var letterPrior: () -> [String: Float] = { [:] }

  private static let tapCore: CGFloat = 0.2
  private static let tapReach: CGFloat = 1
  private static let tapSpread: CGFloat = 0.5
  private static let tapPriorWeight: CGFloat = 0.8

  private var hitSlopOverlay: HitSlopOverlay?

  var showsHitSlop: Bool {
    get { hitSlopOverlay != nil }
    set {
      guard newValue != showsHitSlop else { return }
      if newValue {
        let overlay = HitSlopOverlay(frame: bounds)
        overlay.host = self
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(overlay)
        hitSlopOverlay = overlay
      } else {
        hitSlopOverlay?.removeFromSuperview()
        hitSlopOverlay = nil
      }
    }
  }

  func setKeys(_ views: [KeyButton]) {
    presses.removeAll()
    keys = views
    refreshHitSlop()
  }

  func refreshHitSlop() {
    guard let hitSlopOverlay else { return }
    bringSubviewToFront(hitSlopOverlay)
    hitSlopOverlay.setNeedsDisplay()
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
    return self
  }

  private func hitRects() -> [(key: KeyButton, rect: CGRect)] {
    keys.filter { !$0.isHidden && $0.alpha > 0.01 }
      .map { (key: $0, rect: $0.convert($0.bounds, to: self)) }
  }

  private func nearestKey(at point: CGPoint, in rects: [(key: KeyButton, rect: CGRect)]) -> KeyButton? {
    var nearest: KeyButton?
    var nearestDistance = CGFloat.greatestFiniteMagnitude
    for entry in rects {
      let frame = entry.rect
      let dx = max(frame.minX - point.x, 0, point.x - frame.maxX)
      let dy = max(frame.minY - point.y, 0, point.y - frame.maxY)
      let distance = dx * dx + dy * dy
      if distance < nearestDistance {
        nearestDistance = distance
        nearest = entry.key
      }
    }
    return nearest
  }

  private func key(
    at point: CGPoint, in rects: [(key: KeyButton, rect: CGRect)], prior: [String: Float]
  ) -> KeyButton? {
    guard let nearest = nearestKey(at: point, in: rects) else { return nil }
    guard prior[nearest.keyName] != nil else { return nearest }
    func offset(_ rect: CGRect) -> (CGFloat, CGFloat) {
      ((point.x - rect.midX) / rect.width, (point.y - rect.midY) / rect.height)
    }
    if let rect = rects.first(where: { $0.key === nearest })?.rect {
      let (nx, ny) = offset(rect)
      if abs(nx) < Self.tapCore, abs(ny) < Self.tapCore { return nearest }
    }
    var best = nearest
    var bestScore = -CGFloat.greatestFiniteMagnitude
    for entry in rects {
      guard let chance = prior[entry.key.keyName] else { continue }
      let (dx, dy) = offset(entry.rect)
      guard abs(dx) <= Self.tapReach, abs(dy) <= Self.tapReach else { continue }
      let score =
        Self.tapPriorWeight * log(CGFloat(chance))
        - (dx * dx + dy * dy) / (2 * Self.tapSpread * Self.tapSpread)
      if score > bestScore {
        bestScore = score
        best = entry.key
      }
    }
    return best
  }

  fileprivate func drawHitSlop(in context: CGContext) {
    let rects = hitRects()
    guard !rects.isEmpty else { return }
    let prior = letterPrior()
    let maxChance = CGFloat(prior.values.max() ?? 1)
    let area = rects.map(\.rect).reduce(rects[0].rect) { $0.union($1) }
    let step: CGFloat = 3
    let cols = Int(area.width / step) + 1
    let rows = Int(area.height / step) + 1
    var owners = [KeyButton?](repeating: nil, count: cols * rows)
    for r in 0..<rows {
      for c in 0..<cols {
        let point = CGPoint(
          x: area.minX + CGFloat(c) * step + step / 2, y: area.minY + CGFloat(r) * step + step / 2)
        owners[r * cols + c] = key(at: point, in: rects, prior: prior)
      }
    }
    let border = UIColor(red: 0.13, green: 0.83, blue: 0.93, alpha: 0.8)
    context.setLineWidth(1)
    for r in 0..<rows {
      for c in 0..<cols {
        guard let owner = owners[r * cols + c] else { continue }
        let cell = CGRect(
          x: area.minX + CGFloat(c) * step, y: area.minY + CGFloat(r) * step, width: step,
          height: step)
        let fill =
          prior[owner.keyName].map {
            UIColor(red: 0.13, green: 0.77, blue: 0.37, alpha: 0.16 + 0.55 * CGFloat($0) / maxChance)
          } ?? UIColor(red: 0.96, green: 0.45, blue: 0.71, alpha: 0.125)
        context.setFillColor(fill.cgColor)
        context.fill(cell)
        context.setStrokeColor(border.cgColor)
        if c + 1 < cols, owners[r * cols + c + 1] !== owner {
          context.strokeLineSegments(between: [
            CGPoint(x: cell.maxX, y: cell.minY), CGPoint(x: cell.maxX, y: cell.maxY),
          ])
        }
        if r + 1 < rows, owners[(r + 1) * cols + c] !== owner {
          context.strokeLineSegments(between: [
            CGPoint(x: cell.minX, y: cell.maxY), CGPoint(x: cell.maxX, y: cell.maxY),
          ])
        }
      }
    }
    let label: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 9), .foregroundColor: UIColor.white,
    ]
    for entry in rects {
      guard let chance = prior[entry.key.keyName] else { continue }
      ("\(Int((chance * 100).rounded()))%" as NSString)
        .draw(at: CGPoint(x: entry.rect.minX + 3, y: entry.rect.minY + 1), withAttributes: label)
    }
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    let rects = hitRects()
    let prior = letterPrior()
    for touch in touches {
      let point = touch.location(in: self)
      guard let key = key(at: point, in: rects, prior: prior) else { continue }
      let press = Press(key: key, origin: point)
      let id = ObjectIdentifier(touch)
      presses[id] = press
      touchDelegate?.keyHost(self, didPressDown: key)
      DispatchQueue.main.asyncAfter(deadline: .now() + holdDuration) { [weak self, weak press] in
        guard let self, let press, self.presses[id] === press, press.canHold, !press.isHolding
        else { return }
        press.isHolding =
          self.touchDelegate?.keyHost(self, didBeginHold: press.key, at: press.origin) ?? false
      }
    }
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    for touch in touches {
      guard let press = presses[ObjectIdentifier(touch)] else { continue }
      let point = touch.location(in: self)
      if press.isHolding {
        touchDelegate?.keyHost(self, didMoveHold: press.key, to: point)
      } else if hypot(point.x - press.origin.x, point.y - press.origin.y)
        > holdMovementTolerance
      {
        press.canHold = false
      }
    }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    finish(touches, cancelled: false)
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    finish(touches, cancelled: true)
  }

  private func finish(_ touches: Set<UITouch>, cancelled: Bool) {
    for touch in touches {
      guard let press = presses.removeValue(forKey: ObjectIdentifier(touch)) else { continue }
      let point = touch.location(in: self)
      let slop = holdMovementTolerance
      let padded = press.key.convert(press.key.bounds, to: self).insetBy(dx: -slop, dy: -slop)
      let stayed = hypot(point.x - press.origin.x, point.y - press.origin.y) <= slop
      let onKey = padded.contains(point) && nearestKey(at: point, in: hitRects()) === press.key
      let slidOff = !press.isHolding && !stayed && !onKey
      touchDelegate?.keyHost(
        self,
        didPressUp: press.key,
        at: point,
        held: press.isHolding,
        cancelled: cancelled || slidOff)
    }
  }
}

private final class HitSlopOverlay: UIView {
  weak var host: KeyHostView?

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    isOpaque = false
    backgroundColor = .clear
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    host?.drawHitSlop(in: context)
  }
}

final class KeyButton: UIButton {
  var keyName = ""
  var committedText: String?
  var committedConsumedShiftOnce = false
  var committedConsumedAutoShift = false
  var subtitleText: String?
  private var letterGroupLabel: UILabel?
  private static let subtitleHeight: CGFloat = 10
  private let glassView: UIVisualEffectView?
  private let pressOverlay = UIView()
  private let keyBackground = UIView()
  var visualInsets: UIEdgeInsets = .zero {
    didSet {
      guard visualInsets != oldValue else { return }
      setNeedsLayout()
    }
  }
  private var visualRect: CGRect { bounds.inset(by: visualInsets) }

  init(frame: CGRect, theme: KeyboardTheme) {
    glassView = makeGlassBackdrop(tint: .clear, cornerRadius: 10)
    super.init(frame: frame)
    titleLabel?.textAlignment = .center
    clipsToBounds = false
    pressOverlay.isHidden = true
    pressOverlay.isUserInteractionEnabled = false
    pressOverlay.layer.cornerRadius = 10
    pressOverlay.clipsToBounds = true
    keyBackground.isUserInteractionEnabled = false
    keyBackground.layer.cornerRadius = 10
    insertSubview(keyBackground, at: 0)
    if let glassView {
      insertSubview(glassView, aboveSubview: keyBackground)
      insertSubview(pressOverlay, aboveSubview: glassView)
    } else {
      insertSubview(pressOverlay, aboveSubview: keyBackground)
    }
    applyTheme(theme, isUtility: false, isAccent: false)
    contentVerticalAlignment = .center
    contentHorizontalAlignment = .center
  }

  required init?(coder: NSCoder) {
    glassView = nil
    super.init(coder: coder)
  }

  func setPressed(_ pressed: Bool) {
    pressOverlay.isHidden = !pressed
  }

  func setContentHidden(_ hidden: Bool) {
    let contentAlpha: CGFloat = hidden ? 0 : 1
    titleLabel?.alpha = contentAlpha
    imageView?.alpha = contentAlpha
    letterGroupLabel?.alpha = contentAlpha
  }

  func prepareForReuse() {
    keyName = ""
    committedText = nil
    committedConsumedShiftOnce = false
    committedConsumedAutoShift = false
    subtitleText = nil
    visualInsets = .zero
    setPressed(false)
    setContentHidden(false)
    setTitle(nil, for: .normal)
    setImage(nil, for: .normal)
    isUserInteractionEnabled = true
    isHidden = false
    alpha = 1
  }

  func applyTheme(_ theme: KeyboardTheme, isUtility: Bool, isAccent: Bool) {
    let fill: UIColor
    if isAccent {
      fill = theme.accent
      setTitleColor(.white, for: .normal)
      tintColor = .white
    } else if isUtility {
      fill = theme.toolbar
      setTitleColor(theme.label, for: .normal)
      tintColor = theme.label
    } else {
      fill = theme.key
      setTitleColor(theme.label, for: .normal)
      tintColor = theme.label
    }
    layer.cornerRadius = 10
    keyBackground.layer.cornerRadius = 10
    pressOverlay.layer.cornerRadius = 10
    layer.borderWidth = 0
    layer.masksToBounds = false
    backgroundColor = .clear
    pressOverlay.backgroundColor = theme.keyPressed.withAlphaComponent(0.55)
    applySubtitle(color: isAccent ? .white : theme.label)

    if #available(iOS 26.0, *), let glassView {
      keyBackground.backgroundColor = .clear
      layer.shadowOpacity = 0
      let alpha = (isUtility || isAccent) ? KeySurface.glyphTint : KeySurface.textTint
      let effect = UIGlassEffect(style: .regular)
      effect.tintColor = fill.withAlphaComponent(alpha)
      glassView.effect = effect
      glassView.layer.cornerRadius = layer.cornerRadius
    } else {
      keyBackground.backgroundColor = fill
      layer.shadowColor = UIColor.black.cgColor
      layer.shadowOpacity = 0.35
      layer.shadowOffset = CGSize(width: 0, height: 1)
      layer.shadowRadius = 0.5
    }
  }

  private func applySubtitle(color: UIColor) {
    guard let subtitleText, !subtitleText.isEmpty else {
      letterGroupLabel?.removeFromSuperview()
      letterGroupLabel = nil
      return
    }
    let label: UILabel
    if let existing = letterGroupLabel {
      label = existing
    } else {
      label = UILabel()
      label.textAlignment = .center
      label.isUserInteractionEnabled = false
      addSubview(label)
      letterGroupLabel = label
    }
    label.attributedText = NSAttributedString(
      string: subtitleText,
      attributes: [
        .font: UIFont.systemFont(ofSize: 9, weight: .semibold),
        .foregroundColor: color.withAlphaComponent(0.75),
        .kern: 1.4,
      ])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let visual = visualRect
    layer.shadowPath =
      UIBezierPath(roundedRect: visual, cornerRadius: layer.cornerRadius).cgPath
    keyBackground.frame = visual
    glassView?.frame = visual
    pressOverlay.frame = visual
    enforceBackdropOrder()
    titleLabel?.center = CGPoint(x: visual.midX, y: visual.midY)
    imageView?.center = CGPoint(x: visual.midX, y: visual.midY)
    if let letterGroupLabel {
      let height = Self.subtitleHeight
      titleLabel?.center.y -= height / 2
      letterGroupLabel.frame = CGRect(
        x: visual.minX, y: visual.midY + (visual.height / 2 - height) / 2,
        width: visual.width, height: height)
      bringSubviewToFront(letterGroupLabel)
    }
    if let imageView, imageView.image != nil {
      imageView.frame = pixelSnap(imageView.frame, scale: traitCollection.displayScale)
    }
  }

  private func enforceBackdropOrder() {
    guard subviews.first !== keyBackground else { return }
    sendSubviewToBack(keyBackground)
    if let glassView {
      insertSubview(glassView, aboveSubview: keyBackground)
      insertSubview(pressOverlay, aboveSubview: glassView)
    } else {
      insertSubview(pressOverlay, aboveSubview: keyBackground)
    }
  }

}

final class ToolbarIconView: UIControl {
  let imageView = UIImageView()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private var glass: UIVisualEffectView?
  private var appliedBackground: UIColor?

  init(key: String, image: UIImage?) {
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    widthAnchor.constraint(equalToConstant: 34).isActive = true
    heightAnchor.constraint(equalToConstant: 34).isActive = true
    layer.cornerRadius = 17
    layer.masksToBounds = true
    accessibilityIdentifier = "hypa-toolbar-\(key)"
    imageView.image = image
    imageView.contentMode = .scaleAspectFit
    imageView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(imageView)
    spinner.translatesAutoresizingMaskIntoConstraints = false
    spinner.hidesWhenStopped = true
    addSubview(spinner)
    NSLayoutConstraint.activate([
      imageView.centerXAnchor.constraint(equalTo: centerXAnchor),
      imageView.centerYAnchor.constraint(equalTo: centerYAnchor),
      imageView.widthAnchor.constraint(equalToConstant: 18),
      imageView.heightAnchor.constraint(equalToConstant: 18),
      spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
  }

  func applyBackground(_ color: UIColor) {
    guard color != appliedBackground else { return }
    appliedBackground = color
    guard let backdrop = glass
      ?? makeGlassBackdrop(tint: color.withAlphaComponent(0.9), cornerRadius: 17)
    else {
      backgroundColor = color
      return
    }
    if glass == nil {
      backdrop.frame = bounds
      backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      insertSubview(backdrop, at: 0)
      glass = backdrop
    } else if #available(iOS 26.0, *) {
      let effect = UIGlassEffect(style: .regular)
      effect.tintColor = color.withAlphaComponent(0.9)
      backdrop.effect = effect
    }
    backgroundColor = .clear
  }

  func setLoading(_ loading: Bool, tintColor: UIColor) {
    spinner.color = tintColor
    imageView.isHidden = loading
    loading ? spinner.startAnimating() : spinner.stopAnimating()
  }
}

final class KeyboardSelectionButton: UIButton {
  private static let checkmarkViewTag = 9001

  init(
    title: String,
    isSelected: Bool,
    showsCheckmark: Bool = false,
    theme: KeyboardTheme,
    fontSize: CGFloat
  ) {
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    contentHorizontalAlignment = .left
    setTitle(showsCheckmark ? "  \(title)" : title, for: .normal)
    titleLabel?.font = .systemFont(ofSize: fontSize, weight: .medium)
    contentEdgeInsets = UIEdgeInsets(top: 7, left: 10, bottom: 7, right: 10)
    heightAnchor.constraint(greaterThanOrEqualToConstant: 34).isActive = true
    applySelectionState(isSelected, theme: theme, showsCheckmark: showsCheckmark)
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
  }

  func applySelectionState(
    _ isSelected: Bool,
    theme: KeyboardTheme,
    showsCheckmark: Bool = false
  ) {
    self.isSelected = isSelected
    applyKeyAesthetics(
      background: isSelected ? theme.pill : theme.key,
      cornerRadius: KeySurface.controlRadius,
      pressedColor: theme.keyPressed)
    setTitleColor(isSelected ? theme.pillLabel : theme.label, for: .normal)
    layer.borderWidth = isSelected ? 2 : 0
    layer.borderColor = isSelected ? theme.accent.cgColor : nil
    subviews.first { $0.tag == Self.checkmarkViewTag }?.removeFromSuperview()
    if isSelected, showsCheckmark {
      addCheckmark(color: theme.accent)
    }
  }

  private func addCheckmark(color: UIColor) {
    let checkmark = UIImageView(
      image: UIImage(
        systemName: "checkmark.circle.fill",
        withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .bold)))
    checkmark.tag = Self.checkmarkViewTag
    checkmark.tintColor = color
    checkmark.translatesAutoresizingMaskIntoConstraints = false
    addSubview(checkmark)
    NSLayoutConstraint.activate([
      checkmark.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
      checkmark.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
  }
}

final class KeyboardPickerScrollView: UIScrollView {
  var scrollOffsetKey: String?

  override func touchesShouldCancel(in view: UIView) -> Bool {
    if view is UIControl { return true }
    return super.touchesShouldCancel(in: view)
  }
}

extension UIColor {
  convenience init(hex: String) {
    var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.hasPrefix("#") { raw.removeFirst() }
    var rgb: UInt64 = 0
    Scanner(string: raw).scanHexInt64(&rgb)
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1)
  }
}
