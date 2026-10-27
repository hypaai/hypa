import UIKit

final class EmojiPanelView: UIView {
  private static let gridColumns = 8
  private static let variantColumns = 6
  private static let recentCategoryTitle = "Recent"
  private static let bottomBarHeight: CGFloat = 40
  private static let headerHeight: CGFloat = 18

  private let theme: KeyboardTheme
  private let recentStore: RecentEmojiStore

  private let onPick: (String) -> Void
  private let onSearch: () -> Void
  private let onClose: () -> Void
  private let onDeleteDown: () -> Void
  private let onDeleteUp: () -> Void

  private let headerLabel = UILabel()
  private let tabsRow = UIStackView()
  private let layout = UICollectionViewFlowLayout()
  private lazy var grid = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private var tabButtons: [UIButton] = []
  private var categoryIndex = 0
  private var variantPopup: UIView?

  private var entries: [EmojiEntry] = []
  private var categoryStarts: [Int] = []
  private var gridRows = 1
  private var lastLaidOutGridSize: CGSize = .zero
  private var isProgrammaticScroll = false
  private let tabs: [CategoryTab]

  init(
    theme: KeyboardTheme,
    repository: EmojiRepository,
    recentStore: RecentEmojiStore,
    initialCategoryIndex: Int,
    onPick: @escaping (String) -> Void,
    onSearch: @escaping () -> Void,
    onClose: @escaping () -> Void,
    onDeleteDown: @escaping () -> Void,
    onDeleteUp: @escaping () -> Void
  ) {
    self.theme = theme
    self.recentStore = recentStore
    self.categoryIndex = initialCategoryIndex
    self.onSearch = onSearch
    self.onPick = onPick
    self.onClose = onClose
    self.onDeleteDown = onDeleteDown
    self.onDeleteUp = onDeleteUp

    let recents = recentStore.recent()
    let groups = repository.groups()
    var tabs = groups.map {
      CategoryTab(title: $0.name, symbol: Self.symbol(forGroup: $0.name))
    }
    var entries = groups.map(\.entries)
    if !recents.isEmpty {
      tabs.insert(CategoryTab(title: Self.recentCategoryTitle, symbol: "clock"), at: 0)
      entries.insert(recents.map { EmojiEntry(sequence: $0, name: "", variants: []) }, at: 0)
    }
    self.tabs = tabs
    var flattened: [EmojiEntry] = []
    var starts: [Int] = []
    for group in entries {
      starts.append(flattened.count)
      flattened.append(contentsOf: group)
    }
    self.entries = flattened
    self.categoryStarts = starts
    super.init(frame: .zero)

    backgroundColor = .clear
    buildHeader()
    buildGrid()
    buildBottomBar()
    categoryIndex = min(max(initialCategoryIndex, 0), max(tabs.count - 1, 0))
    applySelection(categoryIndex)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  var selectedCategoryIndex: Int { categoryIndex }

  private func buildHeader() {
    headerLabel.translatesAutoresizingMaskIntoConstraints = false
    headerLabel.font = .systemFont(ofSize: 11, weight: .semibold)
    headerLabel.textColor = .secondaryLabel
    addSubview(headerLabel)
  }

  private func buildGrid() {
    layout.scrollDirection = .horizontal
    layout.minimumLineSpacing = 0
    layout.minimumInteritemSpacing = 0
    layout.sectionInset = .zero
    grid.translatesAutoresizingMaskIntoConstraints = false
    grid.backgroundColor = .clear
    grid.dataSource = self
    grid.delegate = self
    grid.alwaysBounceVertical = false
    grid.alwaysBounceHorizontal = true
    grid.showsHorizontalScrollIndicator = false
    grid.register(EmojiCell.self, forCellWithReuseIdentifier: EmojiCell.reuseIdentifier)
    addSubview(grid)
  }

  private func buildBottomBar() {
    let alphaKey = makeBarKey(title: "ABC", accessibilityLabel: "Letters")
    alphaKey.addAction(UIAction { [weak self] _ in self?.onClose() }, for: .touchUpInside)

    let deleteKey = makeBarKey(title: nil, accessibilityLabel: "Delete")
    deleteKey.setImage(
      UIImage(
        systemName: "delete.backward",
        withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .medium)),
      for: .normal)
    deleteKey.addAction(UIAction { [weak self] _ in self?.onDeleteDown() }, for: .touchDown)
    deleteKey.addAction(
      UIAction { [weak self] _ in self?.onDeleteUp() },
      for: [.touchUpInside, .touchUpOutside, .touchCancel])

    tabsRow.axis = .horizontal
    tabsRow.alignment = .fill
    tabsRow.distribution = .fillEqually
    tabsRow.spacing = 0
    tabsRow.translatesAutoresizingMaskIntoConstraints = false
    addSubview(tabsRow)

    let search = UIButton(type: .system)
    search.setImage(UIImage(systemName: "magnifyingglass"), for: .normal)
    search.tintColor = .secondaryLabel
    search.accessibilityLabel = "Search emoji"
    search.addAction(UIAction { [weak self] _ in self?.onSearch() }, for: .touchUpInside)
    tabsRow.addArrangedSubview(search)

    for (index, tab) in tabs.enumerated() {
      let button = UIButton(type: .system)
      button.setImage(
        UIImage(
          systemName: tab.symbol,
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .regular)),
        for: .normal)
      button.accessibilityLabel = tab.title
      button.layer.cornerRadius = 8
      button.clipsToBounds = true
      button.addAction(
        UIAction { [weak self] _ in self?.showCategory(index, animated: true) },
        for: .touchUpInside)
      tabButtons.append(button)
      tabsRow.addArrangedSubview(button)
    }

    addSubview(alphaKey)
    addSubview(deleteKey)

    NSLayoutConstraint.activate([
      headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 6),
      headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
      headerLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
      headerLabel.heightAnchor.constraint(equalToConstant: Self.headerHeight),

      grid.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 2),
      grid.leadingAnchor.constraint(equalTo: leadingAnchor),
      grid.trailingAnchor.constraint(equalTo: trailingAnchor),
      grid.bottomAnchor.constraint(equalTo: tabsRow.topAnchor, constant: -2),

      alphaKey.centerXAnchor.constraint(equalTo: leadingAnchor, constant: 26),
      alphaKey.centerYAnchor.constraint(equalTo: tabsRow.centerYAnchor),
      alphaKey.widthAnchor.constraint(equalToConstant: 56),
      alphaKey.heightAnchor.constraint(equalToConstant: 40),

      deleteKey.centerXAnchor.constraint(equalTo: trailingAnchor, constant: -26),
      deleteKey.centerYAnchor.constraint(equalTo: tabsRow.centerYAnchor),
      deleteKey.widthAnchor.constraint(equalToConstant: 56),
      deleteKey.heightAnchor.constraint(equalToConstant: 40),

      tabsRow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 50),
      tabsRow.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -50),
      tabsRow.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
      tabsRow.heightAnchor.constraint(equalToConstant: Self.bottomBarHeight - 8),
    ])
  }

  private func makeBarKey(title: String?, accessibilityLabel: String) -> UIButton {
    let key = UIButton(type: .system)
    key.translatesAutoresizingMaskIntoConstraints = false
    key.setTitle(title, for: .normal)
    key.setTitleColor(theme.label, for: .normal)
    key.titleLabel?.font = .systemFont(ofSize: 13, weight: .medium)
    key.tintColor = theme.label
    key.accessibilityLabel = accessibilityLabel
    return key
  }

  private struct CategoryTab {
    let title: String
    let symbol: String
  }

  private static func symbol(forGroup name: String) -> String {
    if name.hasPrefix("Smileys") { return "face.smiling" }
    if name.hasPrefix("People") { return "hand.wave" }
    if name.hasPrefix("Animals") { return "leaf" }
    if name.hasPrefix("Food") { return "fork.knife" }
    if name.hasPrefix("Travel") { return "car" }
    if name.hasPrefix("Activities") { return "sportscourt" }
    if name.hasPrefix("Objects") { return "lightbulb" }
    if name.hasPrefix("Flags") { return "flag" }
    return "number"
  }

  private func showCategory(_ index: Int, animated: Bool) {
    dismissVariantPopup()
    applySelection(index)
    guard categoryStarts.indices.contains(index), grid.bounds.width > 0, gridRows > 0,
      layout.itemSize.width > 0
    else { return }
    let column = categoryStarts[index] / gridRows
    let maxX = max(0, grid.contentSize.width - grid.bounds.width)
    let x = min(CGFloat(column) * layout.itemSize.width, maxX)
    isProgrammaticScroll = true
    grid.setContentOffset(CGPoint(x: x, y: 0), animated: animated)
    if !animated { isProgrammaticScroll = false }
  }

  private func applySelection(_ index: Int) {
    categoryIndex = index
    headerLabel.text = tabs.indices.contains(index) ? tabs[index].title.uppercased() : ""
    for (tabIndex, button) in tabButtons.enumerated() {
      let isSelected = tabIndex == index
      button.tintColor = isSelected ? .white : .secondaryLabel
      button.backgroundColor = isSelected ? theme.accent.withAlphaComponent(0.4) : .clear
    }
  }

  private func categoryForCurrentOffset() -> Int {
    let itemWidth = layout.itemSize.width
    guard itemWidth > 0, gridRows > 0, !entries.isEmpty else { return categoryIndex }
    let offset = max(0, grid.contentOffset.x)
    let firstColumn = Int(offset / itemWidth)
    let lastColumn = max(firstColumn, Int(((offset + grid.bounds.width) / itemWidth).rounded(.up)) - 1)
    let firstItem = firstColumn * gridRows
    let lastItem = min((lastColumn + 1) * gridRows - 1, entries.count - 1)
    guard firstItem <= lastItem else { return categoryIndex }

    var best = categoryIndex
    var bestOverlap = 0
    for (index, start) in categoryStarts.enumerated() {
      let end = (index + 1 < categoryStarts.count ? categoryStarts[index + 1] : entries.count) - 1
      let overlap = min(end, lastItem) - max(start, firstItem) + 1
      if overlap > bestOverlap {
        bestOverlap = overlap
        best = index
      }
    }
    return best
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = grid.bounds.size
    guard size.width > 0, size.height > 0 else { return }
    guard size != lastLaidOutGridSize else { return }
    lastLaidOutGridSize = size

    let scale = traitCollection.displayScale
    let cellWidth = pixelSnap(size.width / CGFloat(Self.gridColumns), scale: scale)
    gridRows = max(1, Int(size.height / (cellWidth * 0.9)))
    layout.itemSize = CGSize(
      width: cellWidth, height: pixelSnap(size.height / CGFloat(gridRows), scale: scale))
    layout.invalidateLayout()
    grid.layoutIfNeeded()

    showCategory(categoryIndex, animated: false)
  }

  private func showVariantPopup(for entry: EmojiEntry, anchor: UIView) {
    dismissVariantPopup()
    let options = [entry.sequence] + entry.variants

    let cell: CGFloat = 46
    let padding: CGFloat = 6
    let columns = min(options.count, Self.variantColumns)
    let rowCount = Int(ceil(Double(options.count) / Double(Self.variantColumns)))

    let container = UIView()
    container.layer.cornerRadius = 14
    container.layer.masksToBounds = true
    let glass = makeGlassBackdrop(
      tint: theme.toolbar.withAlphaComponent(0.88), cornerRadius: 14)
    if let glass {
      container.addSubview(glass)
    } else {
      container.backgroundColor = theme.toolbar
    }

    for (index, sequence) in options.enumerated() {
      let button = UIButton(type: .system)
      button.setTitle(sequence, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 32)
      button.accessibilityLabel = entry.name.isEmpty ? sequence : entry.name
      button.frame = CGRect(
        x: padding + CGFloat(index % Self.variantColumns) * cell,
        y: padding + CGFloat(index / Self.variantColumns) * cell,
        width: cell, height: cell)
      button.addAction(
        UIAction { [weak self] _ in
          self?.dismissVariantPopup()
          self?.pick(sequence)
        }, for: .touchUpInside)
      container.addSubview(button)
    }

    let size = CGSize(
      width: CGFloat(columns) * cell + padding * 2,
      height: CGFloat(rowCount) * cell + padding * 2)
    let anchorFrame = anchor.convert(anchor.bounds, to: self)
    container.frame = CGRect(
      origin: CGPoint(
        x: min(max(4, anchorFrame.midX - size.width / 2), max(4, bounds.width - size.width - 4)),
        y: max(4, anchorFrame.minY - size.height - 6)),
      size: size)
    glass?.frame = container.bounds
    addSubview(container)
    variantPopup = container
  }

  private func dismissVariantPopup() {
    variantPopup?.removeFromSuperview()
    variantPopup = nil
  }

  private func pick(_ sequence: String) {
    recentStore.record(sequence)
    onPick(sequence)
  }
}

extension EmojiPanelView: UICollectionViewDataSource, UICollectionViewDelegate {
  func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int)
    -> Int
  {
    entries.count
  }

  func collectionView(
    _ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    let cell =
      collectionView.dequeueReusableCell(
        withReuseIdentifier: EmojiCell.reuseIdentifier, for: indexPath) as! EmojiCell
    let entry = entries[indexPath.item]
    cell.configure(entry: entry)
    cell.onLongPress = { [weak self, weak cell] in
      guard let self, let cell, entry.hasVariants else { return }
      self.showVariantPopup(for: entry, anchor: cell)
    }
    return cell
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    collectionView.deselectItem(at: indexPath, animated: false)
    dismissVariantPopup()
    pick(entries[indexPath.item].sequence)
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    dismissVariantPopup()
    guard !isProgrammaticScroll else { return }
    let settled = categoryForCurrentOffset()
    if settled != categoryIndex { applySelection(settled) }
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    isProgrammaticScroll = false
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    isProgrammaticScroll = false
  }
}

private final class EmojiCell: UICollectionViewCell {
  static let reuseIdentifier = "emoji"

  private let label = UILabel()
  var onLongPress: (() -> Void)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    label.translatesAutoresizingMaskIntoConstraints = false
    label.textAlignment = .center
    label.font = .systemFont(ofSize: 34)
    label.adjustsFontSizeToFitWidth = true
    contentView.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
      label.topAnchor.constraint(equalTo: contentView.topAnchor),
      label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
    ])
    let longPress = UILongPressGestureRecognizer(
      target: self, action: #selector(handleLongPress(_:)))
    longPress.delaysTouchesEnded = false
    addGestureRecognizer(longPress)
    isAccessibilityElement = true
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(entry: EmojiEntry) {
    label.text = entry.sequence
    label.textColor = .label
    accessibilityLabel = entry.name.isEmpty ? entry.sequence : entry.name
  }

  @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
    guard gesture.state == .began else { return }
    onLongPress?()
  }
}
