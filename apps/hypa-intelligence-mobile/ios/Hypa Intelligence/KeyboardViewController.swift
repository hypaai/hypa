import AVFoundation
import AudioToolbox
import UIKit

class KeyboardViewController: UIInputViewController {

  private enum TextSelectionGranularity {
    case word, line, sentence
  }

  private func granularity(for tapCount: Int) -> TextSelectionGranularity {
    switch tapCount {
    case 1: return .word
    case 2: return .line
    default: return .sentence
    }
  }

  private enum PickerSearchScope {
    case translateSource, translateTarget, ttsLanguage, ttsVoice, sttLanguage, dictionaryLanguage, emoji
  }

  private enum ShiftState {
    case off, once, locked
  }

  private var settings = KeyboardViewController.loadSettings()
  private var selectedVoice: String = ""
  private var selectedTtsLanguageCode = KeyboardLanguageCatalog.defaultSourceLanguage.code

  private var heightConstraint: NSLayoutConstraint?

  private static let shiftDoubleTapInterval: TimeInterval = 0.3
  private var shiftState: ShiftState = .off
  private var isAutoShifted = false
  private var autoShiftDismissed = false
  private var lastShiftTapTime: TimeInterval = 0
  private var isShifted: Bool { shiftState != .off || isAutoShifted }

  private var isApplyingKeyboardText = false
  private var hasUndoableAutoPeriod = false
  private var keyPreviewView: UILabel?

  private var capMode: AutoCapMode { AutoCapMode.detect(proxy: textDocumentProxy) }
  private var contextMode: ContextMode { ContextMode.detect(textDocumentProxy) }
  private var allowsProseAssists: Bool { capMode.allowsProseAssists }
  private var boardMode: KeyboardBoardMode = .alphabet
  private var appliedKeyboardType: UIKeyboardType?
  private var hostFieldSignature = ""
  private var numericCorner = ""
  private var buttonByKey: [String: KeyButton] = [:]
  private var toolbarIconViews: [String: ToolbarIconView] = [:]
  private var dictionaryListenButtons: [String: UIButton] = [:]
  private weak var activeListenButtonRef: UIButton?
  private var modeBar: UIStackView?
  private var translateHeaderView: UIView?
  private var dictionaryHeaderView: UIView?
  private var pickerSearchView: UIView?
  private var fullPanelView: UIView?
  private var boardPanelView: UIView?
  private var keyButtons: [KeyButton] = []
  private var recycledKeyButtons: [KeyButton] = []
  private var pickerScrollOffsets: [String: CGFloat] = [:]
  private var currentRows: [[String]] = []
  private var featureMode: FeatureMode = .keyboard
  private var toolOrder: [KeyboardTool] = KeyboardTool.allCases
  private var isToolsPanelOpen = false
  private var isClipboardEditMode = false
  private var isTextEditingSelectMode = false
  private var textEditingAnchor = -1
  private var textEditingSelectionFocus = -1
  private var textEditingSelectionDocument: String?
  private var textEditingSelectionDocumentID: UUID?
  private var textEditingSelectionGeneration = 0
  private var textEditingPreferredVerticalColumn: Int?
  private var textEditingLastVerticalCaretOffset: Int?
  private var textEditingLastVerticalDocument: String?
  private var expectedEmojiSearchDocument: EmojiSearchDocumentState?
  private var pickerSearchScope: PickerSearchScope? {
    didSet {
      if pickerSearchScope != .emoji { expectedEmojiSearchDocument = nil }
    }
  }
  private var pickerSearchQuery = ""
  private var pickerSearchReturnMode: FeatureMode?
  private var contextRefreshScheduled = false
  private var pendingWordEnd = false
  private var appliedLetterCaseIsShifted: Bool?
  private var appliedReturnKeyType: UIReturnKeyType?
  private var keyGlassContainer: UIVisualEffectView?
  private var keyHost: KeyHostView?
  private var deleteRepeatTimer: Timer?
  private var deleteRepeatDelayTimer: Timer?
  private var cursorTrackpad: CursorTrackpad?
  private let keyFeedbackGenerator = UIImpactFeedbackGenerator(style: .light)
  private static let keyClickSoundID: SystemSoundID = 1104
  private static let keyHapticIntensity: CGFloat = 0.75

  private enum ToolbarErrorSlot: Int {
    case modeBar = 1, clipboard, textEditing, translate, dictionary, stt, tts
  }

  private let toolbarErrorDuration: TimeInterval = 3.5
  private var toolbarErrors: [ToolbarErrorSlot: String] = [:]
  private var toolbarErrorTimers: [ToolbarErrorSlot: Timer] = [:]

  private var sourceLanguageCode = KeyboardLanguageCatalog.defaultSourceLanguage.code
  private var sourceLanguageName = KeyboardLanguageCatalog.defaultSourceLanguage.name
  private var targetLanguageCode = KeyboardLanguageCatalog.defaultTargetLanguage.code
  private var targetLanguageName = KeyboardLanguageCatalog.defaultTargetLanguage.name
  private var keyboardLanguageCode = KeyboardLanguageCatalog.defaultSourceLanguage.code
  private var keyboardLanguageName = KeyboardLanguageCatalog.defaultSourceLanguage.name
  private var isTranslating = false
  private var latestTranslationThinking: String?
  private var lastSentTranslationSourceText: String?
  private var lastExplainableTranslation: ExplainableTranslation?
  private var isTranslationThinkingLoading = false
  private var supportsTranslationThinking: Bool {
    KeyboardLanguageCatalog.resolveTranslation(
      selectedProvider: settings.translationProvider,
      selectedModel: settings.translationModel
    ).provider.caseInsensitiveCompare("hypaai") == .orderedSame
  }
  private var canShowTranslationThinking: Bool {
    lastExplainableTranslation != nil && supportsTranslationThinking
  }
  private var thinkingTask: URLSessionDataTask?
  private var thinkingRequestGeneration = 0
  private var lastTranslationState: LastTranslationState?
  private var translationMutationGeneration = 0
  private var isRestoringTranslation = false
  private var isMutatingTranslationDocument = false
  private var isTraversingDocument = false
  private var suppressTranslationUndoHostSyncUntil: TimeInterval = 0
  private var translationTask: URLSessionDataTask?
  private var locallyTypedText = ""
  private let localTextCacheLimit = 4000
  private var typedTail = ""
  private static let typedTailLimit = 32
  private static let hitSlopDebugTrigger = "@@@@!!@"
  private static let tapBarShare: Float = 0.5
  private var showHitSlopOverlay = false
  private var letterPriorKey: String?
  private var letterPrior: [String: Float] = [:]

  private static let suggestionSlots = 3
  private static let predictionMode = PredictionMode.hybrid
  private static let blockCorrectionCharInterval = 25
  private static let idleBlockCorrectionDelay: TimeInterval = 1.0
  private static let maxBlockLookbackChars = 600

  private let keyboardDataContainer = keyboardDataContainerURL()
  private let corpusStore = CorpusStore()
  private lazy var personalVocabulary: PersonalVocabulary = PersonalVocabulary(
    containerURL: keyboardDataContainer)
  private lazy var autocorrectEngine: AutocorrectEngine = AutocorrectEngine(
    corpus: corpusStore, personal: personalVocabulary)
  private let correctionLedger = CorrectionLedger()
  private let correctionWorker = DispatchQueue(label: "hypa-autocorrect", qos: .userInitiated)
  private lazy var fuzzyProvider: FuzzyProvider = FuzzyProvider(
    corpus: corpusStore,
    personal: personalVocabulary,
    onRepairsReady: { [weak self] in self?.predictionOrchestrator.refresh() })
  private let tinyKeys = TinyKeysService()
  private let modelQueue = DispatchQueue(label: "hypa-model-load", qos: .utility)
  private lazy var inferenceScheduler: InferenceScheduler = InferenceScheduler(
    onSuperseded: { [weak self] in self?.tinyKeys.cancel() })
  private lazy var blockCorrector: BlockCorrector = BlockCorrector(
    neural: tinyKeys,
    scheduler: inferenceScheduler,
    ledger: correctionLedger,
    onCorrected: { [weak self] original, corrected in
      self?.applyBlockCorrection(original: original, corrected: corrected)
    })
  private lazy var predictionOrchestrator: PredictionOrchestrator = PredictionOrchestrator(
    neural: tinyKeys,
    scheduler: inferenceScheduler,
    providers: [
      PersonalProvider(personal: personalVocabulary),
      CorpusProvider(corpus: corpusStore, personal: personalVocabulary),
      fuzzyProvider,
    ],
    maxSuggestions: Self.suggestionSlots,
    mode: Self.predictionMode,
    isKnownWord: { [corpusStore, personalVocabulary] word in
      corpusStore.isCommon(TextNormalizer.normalize(word)) || personalVocabulary.contains(word)
    },
    listener: { [weak self] state in self?.onSuggestionsChanged(state) })
  private var currentSuggestions: [String] = []
  private var modelSuggestions: Set<String> = []
  private lazy var modelDot = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 4)).image { _ in
    UIColor(red: 52 / 255, green: 199 / 255, blue: 89 / 255, alpha: 0.31).setFill()
    UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 4, height: 4)).fill()
  }.withRenderingMode(.alwaysOriginal)
  private var charsSinceBlockCorrection = 0
  private var idleBlockCorrectionTimer: Timer?
  private let doubleSpacePeriodWindow: TimeInterval = 0.4
  private var lastSpaceCommitTime: TimeInterval = 0

  private let emojiRepository = EmojiRepository()
  private lazy var recentEmojiStore = RecentEmojiStore(containerURL: keyboardDataContainer)
  private var emojiCategoryIndex = 0

  private struct LimitedTextContext: Equatable {
    let before: String
    let selected: String
    let after: String

    var surroundingText: String { before + selected + after }
  }

  private struct ExplainableTranslation {
    let sourceText: String
    let translatedText: String
    let sourceLang: String
    let targetLang: String
    let requestId: String
  }

  private struct LastTranslationState {
    enum Scope {
      case selection(expectedBefore: String, expectedAfter: String, original: String)
      case document(expected: String, original: String)
    }

    let translatedText: String
    let scope: Scope

    var isSelectionScoped: Bool {
      if case .selection = scope { return true }
      return false
    }
  }

  private let contextBeforeLimit = 512
  private let contextAfterLimit = 256

  private func limitedTextContext() -> LimitedTextContext {
    LimitedTextContext(
      before: String(
        (textDocumentProxy.documentContextBeforeInput ?? "").suffix(contextBeforeLimit)),
      selected: textDocumentProxy.selectedText ?? "",
      after: String(
        (textDocumentProxy.documentContextAfterInput ?? "").prefix(contextAfterLimit)))
  }

  private func playKeyFeedback() {
    guard settings.hapticsEnabled else { return }
    AudioServicesPlaySystemSound(Self.keyClickSoundID)
    keyFeedbackGenerator.impactOccurred(intensity: Self.keyHapticIntensity)
    keyFeedbackGenerator.prepare()
  }

  private var dictionaryLanguageCode = KeyboardLanguageCatalog.defaultDictionaryLanguage.code
  private var dictionaryLanguageName = KeyboardLanguageCatalog.defaultDictionaryLanguage.name
  private var isDictionaryLoading = false
  private var latestDictionaryResult: DictionaryResultCardData?
  private var latestDictionaryResultText: String?
  private var dictionaryTask: URLSessionDataTask?
  private var lastSentDictionarySourceText: String?

  private var ttsTask: URLSessionDataTask?
  private var ttsAudioPlayer: AVAudioPlayer?
  private var ttsAudioData: Data?
  private var isTtsLoading = false
  private var isTtsPlaying = false
  private var isTtsPaused = false
  private var activeDictionarySpeechIdentifier: String?
  private var ttsRequestGeneration = 0

  private var sttAudioEngine: AVAudioEngine?
  private let sttAudioQueue = DispatchQueue(
    label: "com.hypaintelligence.hypaintelligence.stt-audio")
  private var sttFullRecording = Data()
  private var sttRecordedWav: Data?
  private var isSttStarting = false
  private var isSttListening = false
  private var isSttProcessing = false
  private var hasSttRecordingReady = false
  private var sttCapturedText = ""
  private var sttPulseTimer: Timer?
  private weak var sttLiveLabel: UILabel?
  private var selectedSttLanguageCode = KeyboardLanguageCatalog.autoDetect.code
  private var selectedSttLanguageName = KeyboardLanguageCatalog.autoDetect.name

  private var sttPreviewPlayer: AVAudioPlayer?
  private var isSttPreviewPlaying = false

  private var supportedLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.languages(model: settings.translationModel)
  }

  private var supportedSourceLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.translationSourceLanguages(model: settings.translationModel)
  }

  private var supportedTargetLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.translationTargetLanguages(model: settings.translationModel)
  }

  private var keyboardLayoutPickerLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.keyboardLayoutLanguages(model: settings.translationModel)
  }

  private var supportedKeyboardLayoutLanguages: [TranslationLanguage] {
    keyboardLayoutPickerLanguages.filter {
      KeyboardLanguageCatalog.hasCustomLayout(languageCode: $0.code)
    }
  }

  private var supportedSttLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.sttLanguages(model: settings.sttModel)
  }

  private var supportedTtsLanguages: [TranslationLanguage] {
    KeyboardLanguageCatalog.ttsLanguages(model: resolvedTtsServiceModel().model)
  }

  private var keyWidth: CGFloat = 0
  private var spaceWidth: CGFloat = 0
  private let sideMargin: CGFloat = 4
  private let keyGap: CGFloat = 5
  private let utilityKeyExtraWidth: CGFloat = 10
  private let keyVisualInsetX: CGFloat = 1
  private let keyVisualInsetY: CGFloat = 2
  private let topPadding: CGFloat = 52
  private let modeBarHeight: CGFloat = 46
  private let toolbarSideInset: CGFloat = 24
  private let panelSideInset: CGFloat = 16

  private var panelTitleFontSize: CGFloat { max(settings.fontSize - 3, 12) }
  private var panelOptionFontSize: CGFloat { max(settings.fontSize - 7, 11) }
  private var panelCaptionFontSize: CGFloat { max(settings.fontSize - 9, 10) }
  private var rowSpacing: CGFloat { boardMode == .numeric ? 7 : keyGap }
  private var keyAreaHeight: CGFloat { settings.keyboardHeight - 46 }
  private var keyHeight: CGFloat { max(0, keyAreaHeight - rowSpacing * 3) / 4 }

  private var shiftHeight: CGFloat { return keyHeight }
  private var spaceHeight: CGFloat { return keyHeight }

  private let returnWidth: CGFloat = 90
  private let useAnimatedWaveform = true

  private func dictionarySupportedLanguages() -> [TranslationLanguage] {
    KeyboardLanguageCatalog.dictionaryLanguages(model: settings.dictionaryModel)
  }

  private func activeKeyboardLanguageCode() -> String {
    keyboardLanguageCode
  }

  private func activeKeyboardLanguageName() -> String {
    keyboardLanguageName
  }

  private var keyboardCaseLocale: Locale {
    Locale(identifier: activeKeyboardLanguageCode().replacingOccurrences(of: "_", with: "-"))
  }

  private func keyboardUppercased(_ text: String) -> String {
    text.uppercased(with: keyboardCaseLocale)
  }

  private func setKeyboardLanguage(_ language: TranslationLanguage, persist: Bool = false) {
    keyboardLanguageCode = language.code
    keyboardLanguageName = language.name
    corpusStore.setLanguage(language.code)
    if persist { saveSharedLanguageSettings(keyboardLanguageId: language.code) }
  }

  private func syncKeyboardLanguageToModel() {
    let available = supportedKeyboardLayoutLanguages
    guard !available.isEmpty else { return }
    let preferredCode = canonicalLanguageCode(
      settings.languageId.trimmingCharacters(in: .whitespacesAndNewlines))
    if let preferred = available.first(where: {
      $0.code.caseInsensitiveCompare(preferredCode) == .orderedSame
    }) {
      setKeyboardLanguage(preferred)
    } else {
      let fallback =
        available.first(where: {
          $0.code.caseInsensitiveCompare(KeyboardLanguageCatalog.defaultSourceLanguage.code)
            == .orderedSame
        }) ?? available[0]
      setKeyboardLanguage(fallback)
    }
  }

  private func cycleKeyboardLanguage() {
    let available = supportedKeyboardLayoutLanguages
    guard !available.isEmpty else { return }
    let currentCode = activeKeyboardLanguageCode()
    let currentIndex = available.firstIndex {
      $0.code.caseInsensitiveCompare(currentCode) == .orderedSame
    }
    let nextIndex = currentIndex.map { ($0 + 1) % available.count } ?? 0
    setKeyboardLanguage(available[nextIndex], persist: true)
    boardMode = .alphabet
    rebuildKeyboard()
  }

  private func syncDictionaryLanguageToModel() {
    let available = dictionarySupportedLanguages()
    let fallback =
      available.first(where: {
        $0.code.caseInsensitiveCompare(KeyboardLanguageCatalog.defaultDictionaryLanguage.code)
          == .orderedSame
      }) ?? available.first ?? KeyboardLanguageCatalog.defaultDictionaryLanguage

    if let fromSettings = resolveLanguageName(
      settings.dictionaryLanguage,
      in: available,
      allowAutoDetect: false
    ) {
      dictionaryLanguageCode = fromSettings.code
      dictionaryLanguageName = fromSettings.name
      return
    }

    if let match = available.first(where: {
      $0.code.caseInsensitiveCompare(dictionaryLanguageCode) == .orderedSame
        || $0.name.caseInsensitiveCompare(dictionaryLanguageName) == .orderedSame
    }) {
      dictionaryLanguageCode = match.code
      dictionaryLanguageName = match.name
    } else {
      dictionaryLanguageCode = fallback.code
      dictionaryLanguageName = fallback.name
    }

    if dictionaryLanguageName.caseInsensitiveCompare(settings.dictionaryLanguage) != .orderedSame {
      saveSharedLanguageSettings(dictionaryLanguage: dictionaryLanguageName)
    }
  }

  private func resolveLanguageName(
    _ rawName: String,
    in available: [TranslationLanguage],
    allowAutoDetect: Bool
  ) -> TranslationLanguage? {
    let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if allowAutoDetect,
      trimmed.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.name) == .orderedSame
        || trimmed.caseInsensitiveCompare("Auto Detect") == .orderedSame
        || trimmed.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.code) == .orderedSame
    {
      return KeyboardLanguageCatalog.autoDetect
    }

    if let byName = available.first(where: {
      $0.name.caseInsensitiveCompare(trimmed) == .orderedSame
    }) {
      return byName
    }

    let code = canonicalLanguageCode(trimmed)
    return available.first(where: { $0.code.caseInsensitiveCompare(code) == .orderedSame })
  }

  private func applySharedLanguageSettingsFromStorage() {
    let sourceAvailable = supportedSourceLanguages
    let targetAvailable = supportedTargetLanguages
    let dictionaryAvailable = dictionarySupportedLanguages()

    if let source = resolveLanguageName(
      settings.translateSourceLanguage,
      in: sourceAvailable,
      allowAutoDetect: true
    ) {
      sourceLanguageCode = source.code
      sourceLanguageName = source.name
    } else {
      sourceLanguageCode = KeyboardLanguageCatalog.autoDetect.code
      sourceLanguageName = KeyboardLanguageCatalog.autoDetect.name
      saveSharedLanguageSettings(translateSourceLanguage: sourceLanguageName)
    }

    if let target = resolveLanguageName(
      settings.translateTargetLanguage,
      in: targetAvailable,
      allowAutoDetect: false
    ) {
      targetLanguageCode = target.code
      targetLanguageName = target.name
    }

    if let dictionary = resolveLanguageName(
      settings.dictionaryLanguage,
      in: dictionaryAvailable,
      allowAutoDetect: false
    ) {
      dictionaryLanguageCode = dictionary.code
      dictionaryLanguageName = dictionary.name
    }

    let storedTtsCode = canonicalLanguageCode(settings.ttsLanguage)
    if let tts = supportedTtsLanguages.first(where: {
      $0.code.caseInsensitiveCompare(storedTtsCode) == .orderedSame
    }) {
      selectedTtsLanguageCode = tts.code
    } else {
      let fallback =
        supportedTtsLanguages.first(where: {
          $0.code.caseInsensitiveCompare(KeyboardLanguageCatalog.defaultSourceLanguage.code)
            == .orderedSame
        })
        ?? supportedTtsLanguages.first
        ?? KeyboardLanguageCatalog.defaultSourceLanguage
      selectedTtsLanguageCode = fallback.code
      if storedTtsCode.caseInsensitiveCompare(fallback.code) != .orderedSame {
        saveSharedLanguageSettings(ttsLanguage: fallback.code)
      }
    }
  }

  private func syncTranslateLanguagesToModel() {
    let sourceAvailable = supportedSourceLanguages
    let targetAvailable = supportedTargetLanguages
    guard !sourceAvailable.isEmpty, !targetAvailable.isEmpty else { return }

    let previousSourceName = sourceLanguageName
    let previousTargetName = targetLanguageName

    if sourceLanguageCode.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.code)
      == .orderedSame
      || sourceLanguageName.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.name)
        == .orderedSame
      || sourceLanguageName.caseInsensitiveCompare("Auto Detect") == .orderedSame
    {
      sourceLanguageCode = KeyboardLanguageCatalog.autoDetect.code
      sourceLanguageName = KeyboardLanguageCatalog.autoDetect.name
    } else if let source = sourceAvailable.first(where: {
      $0.code.caseInsensitiveCompare(sourceLanguageCode) == .orderedSame
        || $0.name.caseInsensitiveCompare(sourceLanguageName) == .orderedSame
    }) {
      sourceLanguageCode = source.code
      sourceLanguageName = source.name
    } else {
      let fallback =
        sourceAvailable.first(where: {
          $0.code.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.code) == .orderedSame
        }) ?? sourceAvailable[0]
      sourceLanguageCode = fallback.code
      sourceLanguageName = fallback.name
    }

    if let target = targetAvailable.first(where: {
      $0.code.caseInsensitiveCompare(targetLanguageCode) == .orderedSame
        || $0.name.caseInsensitiveCompare(targetLanguageName) == .orderedSame
    }) {
      targetLanguageCode = target.code
      targetLanguageName = target.name
    } else {
      let fallback =
        targetAvailable.first(where: {
          $0.code.caseInsensitiveCompare(KeyboardLanguageCatalog.defaultTargetLanguage.code)
            == .orderedSame && $0.code.caseInsensitiveCompare(sourceLanguageCode) != .orderedSame
        })
        ?? targetAvailable.first(where: {
          $0.code.caseInsensitiveCompare(sourceLanguageCode) != .orderedSame
        }) ?? targetAvailable[0]
      targetLanguageCode = fallback.code
      targetLanguageName = fallback.name
    }

    if previousSourceName != sourceLanguageName || previousTargetName != targetLanguageName {
      saveSharedLanguageSettings(
        translateSourceLanguage: sourceLanguageName,
        translateTargetLanguage: targetLanguageName
      )
    }

    let sttAvailable = supportedSttLanguages
    if selectedSttLanguageCode.caseInsensitiveCompare(KeyboardLanguageCatalog.autoDetect.code)
      != .orderedSame,
      !sttAvailable.contains(where: {
        $0.code.caseInsensitiveCompare(selectedSttLanguageCode) == .orderedSame
      })
    {
      selectedSttLanguageCode = KeyboardLanguageCatalog.autoDetect.code
      selectedSttLanguageName = KeyboardLanguageCatalog.autoDetect.name
    }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    settings.interfaceStyle = traitCollection.userInterfaceStyle
    toolOrder = KeyboardToolOrder.load()
    selectedVoice = settings.voice
    markKeyboardLoaded()
    applySharedLanguageSettingsFromStorage()
    syncDictionaryLanguageToModel()
    syncTranslateLanguagesToModel()
    syncKeyboardLanguageToModel()
    buildKeyboard()
    emojiRepository.warmup()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    markKeyboardLoaded()
    settings = Self.loadSettings()
    settings.interfaceStyle = traitCollection.userInterfaceStyle
    toolOrder = KeyboardToolOrder.load()
    captureClipOnAppearance()
    isToolsPanelOpen = false
    isClipboardEditMode = false
    let storedVoice = settings.voice.trimmingCharacters(in: .whitespacesAndNewlines)
    if !storedVoice.isEmpty {
      selectedVoice = storedVoice
    }
    applySharedLanguageSettingsFromStorage()
    syncTranslateLanguagesToModel()
    normalizeSelectedVoiceForTtsLanguage(persist: true)
    syncDictionaryLanguageToModel()
    syncKeyboardLanguageToModel()
    appliedKeyboardType = nil
    pendingWordEnd = false
    typedTail = ""
    lastSpaceCommitTime = 0
    hasUndoableAutoPeriod = false
    resetShift()
    boardMode = .alphabet
    syncBoardModeToHostField()
    hostFieldSignature = currentHostFieldSignature()
    rebuildKeyboard()
    publishPredictionContext()
    if usesNeuralEngine { modelQueue.async { [tinyKeys] in tinyKeys.load() } }
  }

  override func didReceiveMemoryWarning() {
    super.didReceiveMemoryWarning()
    tinyKeys.cancel()
    modelQueue.async { [tinyKeys] in tinyKeys.unload() }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    finishTextEditingSelection()
    recentAlternateUnit = nil
    expectedEmojiSearchDocument = nil
    recycledKeyButtons.removeAll()
    pendingWordEnd = false
    endCursorTrackpad()
    correctionLedger.reset()
    predictionOrchestrator.reset()
    fuzzyProvider.reset()
    currentSuggestions = []
    charsSinceBlockCorrection = 0
    idleBlockCorrectionTimer?.invalidate()
    idleBlockCorrectionTimer = nil
    tinyKeys.cancel()
    modelQueue.async { [tinyKeys] in tinyKeys.unload() }
    stopDeleteRepeat(refreshUI: false)
    stopSttListening()
    stopSttPreview()
    stopTts()
    translationTask?.cancel()
    dictionaryTask?.cancel()
    lastSentDictionarySourceText = nil
    clearTranslationThinkingState()
    lastTranslationState = nil
    isTranslating = false
    isRestoringTranslation = false
    isMutatingTranslationDocument = false
    isTraversingDocument = false
    translationMutationGeneration += 1
    toolbarErrorTimers.values.forEach { $0.invalidate() }
    toolbarErrorTimers.removeAll()
    sttPulseTimer?.invalidate()
    sttPulseTimer = nil
  }

  override func textDidChange(_ textInput: UITextInput?) {
    if shouldKeepPickerSearchForOwnInsertion { return }
    if !shouldKeepRecentAlternateUnit { recentAlternateUnit = nil }
    if !isApplyingKeyboardText { hideAlternatePopup() }
    let resetBoard = resetTypingSessionIfHostFieldChanged()
    if pickerSearchActive && !isApplyingKeyboardText && !isMutatingTranslationDocument {
      pickerSearchScope = nil
      pickerSearchQuery = ""
      pickerSearchReturnMode = nil
      featureMode = .keyboard
      showModeBarUntilNextTyping = false
      rebuildKeyboard()
      return
    }
    if (isTranslating || isRestoringTranslation) && !isMutatingTranslationDocument
      && !isTraversingDocument
    {
      discardTranslationUndo()
    }
    if lastTranslationState != nil
      && !isTraversingDocument
      && Date().timeIntervalSince1970 >= suppressTranslationUndoHostSyncUntil
    {
      discardTranslationUndo()
    }
    if syncBoardModeToHostField() || resetBoard { rebuildKeyboard() }
    updateTextEditingState()
    refreshReturnKeyIfNeeded()
    scheduleContextRefresh()
  }
  override func selectionDidChange(_ textInput: UITextInput?) {
    if shouldKeepPickerSearchForOwnInsertion { return }
    finishTextEditingSelectionIfHostDiverged()
    if !shouldKeepRecentAlternateUnit { recentAlternateUnit = nil }
    if !isApplyingKeyboardText { hideAlternatePopup() }
    if pickerSearchActive && !isApplyingKeyboardText && !isMutatingTranslationDocument {
      pickerSearchScope = nil
      pickerSearchQuery = ""
      pickerSearchReturnMode = nil
      featureMode = .keyboard
      showModeBarUntilNextTyping = false
      rebuildKeyboard()
      return
    }
    if resetTypingSessionIfHostFieldChanged() { rebuildKeyboard() }
    updateTextEditingState()
    typedTail = ""
    scheduleContextRefresh()
  }

  private func currentHostFieldSignature() -> String {
    [
      textDocumentProxy.keyboardType?.rawValue ?? UIKeyboardType.default.rawValue,
      textDocumentProxy.returnKeyType?.rawValue ?? UIReturnKeyType.default.rawValue,
      textDocumentProxy.autocapitalizationType?.rawValue ?? UITextAutocapitalizationType.sentences.rawValue,
      textDocumentProxy.autocorrectionType?.rawValue ?? UITextAutocorrectionType.default.rawValue,
      textDocumentProxy.spellCheckingType?.rawValue ?? UITextSpellCheckingType.default.rawValue,
      textDocumentProxy.isSecureTextEntry == true ? 1 : 0,
    ].map(String.init).joined(separator: "|")
  }

  private func resetTypingSessionIfHostFieldChanged() -> Bool {
    let signature = currentHostFieldSignature()
    defer { hostFieldSignature = signature }
    guard !hostFieldSignature.isEmpty, signature != hostFieldSignature else { return false }
    resetShift()
    lastSpaceCommitTime = 0
    hasUndoableAutoPeriod = false
    if boardMode.isSymbolBoard {
      boardMode = .alphabet
      return true
    }
    return false
  }
  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection)
    else { return }
    let style = traitCollection.userInterfaceStyle
    let switchesPalette = settings.appearance == .system && style != settings.interfaceStyle
    settings.interfaceStyle = style
    if switchesPalette {
      rebuildKeyboard()
    } else {
      applyTheme()
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    layoutKeyboard()
  }

  private var pickerSearchOwner: ToolbarErrorSlot? {
    switch pickerSearchScope {
    case .translateSource, .translateTarget: return .translate
    case .dictionaryLanguage: return .dictionary
    case .ttsLanguage, .ttsVoice: return .tts
    case .sttLanguage: return .stt
    case .emoji, nil: return nil
    }
  }

  private func headerFeatureMode(for slot: ToolbarErrorSlot) -> FeatureMode {
    switch slot {
    case .modeBar: return .keyboard
    case .clipboard: return .clipboard
    case .textEditing: return .textEditing
    case .translate: return .translate
    case .dictionary: return .dictionary
    case .stt: return .stt
    case .tts: return .tts
    }
  }

  private func showToolbarError(_ slot: ToolbarErrorSlot, _ msg: String) {
    let closeSearch = pickerSearchOwner == slot
    toolbarErrorTimers[slot]?.invalidate()
    toolbarErrors[slot] = msg
    toolbarErrorTimers[slot] = Timer.scheduledTimer(
      withTimeInterval: toolbarErrorDuration, repeats: false
    ) {
      [weak self] _ in
      DispatchQueue.main.async {
        self?.toolbarErrors[slot] = nil
        self?.toolbarErrorTimers[slot] = nil
        if slot == .modeBar {
          self?.rebuildKeyboard()
        } else {
          self?.updateUI()
        }
      }
    }
    devLog("ToolbarError[%@]: %@", String(describing: slot), msg)
    if closeSearch {
      closePickerSearch(overrideReturnMode: headerFeatureMode(for: slot))
      return
    }
    if slot == .modeBar {
      rebuildKeyboard()
    } else {
      updateUI()
    }
  }

  private func dismissToolbarError(_ slot: ToolbarErrorSlot) {
    toolbarErrorTimers[slot]?.invalidate()
    toolbarErrorTimers[slot] = nil
    guard toolbarErrors.removeValue(forKey: slot) != nil else { return }
    if slot == .modeBar { rebuildKeyboard() } else { updateUI() }
  }

  @objc private func dismissToolbarErrorTap(_ gesture: UITapGestureRecognizer) {
    guard let slot = ToolbarErrorSlot(rawValue: gesture.view?.tag ?? 0) else { return }
    dismissToolbarError(slot)
  }

  private func clearToolbarError(_ slot: ToolbarErrorSlot) {
    toolbarErrorTimers[slot]?.invalidate()
    toolbarErrorTimers[slot] = nil
    toolbarErrors[slot] = nil
  }

  private func extractJsonBody(_ body: String, context: String = "API") -> String {
    devLog("[%@] Raw response body: %@", context, body)
    let t = body.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.hasPrefix("{") { return t }
    if let r = t.range(of: "data:") {
      let c = t[r.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
      if c.hasPrefix("{") { return c }
    }
    if let i = t.firstIndex(of: "{") { return String(t[i...]) }
    return t
  }

  private func parseJsonObject(from body: String, context: String) -> [String: Any]? {
    let jsonStr = extractJsonBody(body, context: context)
    guard let data = jsonStr.data(using: .utf8),
      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      devLog("[%@] ✗ JSON parse failed", context)
      return nil
    }
    devLog("[%@] ✓ JSON parsed successfully", context)
    return obj
  }

  private func isInvalidGeneratedText(_ text: String) -> Bool {
    let n = text.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .lowercased()
    return n.isEmpty || n.hasPrefix("error: no translation") || n.hasPrefix("no translation")
  }

  private func makeAuthorizedPostRequest(
    url: URL, token: String?, payload: [String: Any], timeout: TimeInterval = 30,
    accept: String = "application/json; charset=utf-8"
  ) -> URLRequest? {
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
      devLog("✗ Failed to serialize payload for %@", url.absoluteString)
      return nil
    }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = timeout
    req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
    req.setValue(accept, forHTTPHeaderField: "Accept")
    if let token = token?.trimmingCharacters(in: .whitespacesAndNewlines), !token.isEmpty {
      req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    req.httpBody = body
    return req
  }

  private func checkHttpError(response: URLResponse?, data: Data?, context: String) -> String? {
    guard let http = response as? HTTPURLResponse else { return nil }
    guard !(200...299).contains(http.statusCode) else { return nil }
    let bodyStr = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    devLog("[%@] ✗ HTTP %d body=%@", context, http.statusCode, bodyStr)
    if http.statusCode == 401 {
      showLoginRequired()
    }
    if let apiCode = apiErrorCode(from: data), let named = KeyboardErrorCatalog.apiCode(apiCode) {
      return named
    }
    return KeyboardErrorCatalog.http(http.statusCode)
  }

  private func apiErrorCode(from data: Data?) -> Int? {
    guard let data,
      let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return body["code"] as? Int
  }

  private func translationParseErrorMessage(_ error: Error) -> String {
    let nsError = error as NSError
    if nsError.domain == "HypaKeyboardTranslation", nsError.code == 1 || nsError.code == 2 {
      return KeyboardErrorCatalog.noTranslation
    }
    return KeyboardErrorCatalog.tryAgain
  }

  private func showLoginRequired() {
    featureMode = .loginRequired
    rebuildKeyboard()
  }

  private func activatePlaybackAudioSession() throws {
    try AVAudioSession.sharedInstance().setCategory(
      .playback, mode: .default, options: [.duckOthers])
    try AVAudioSession.sharedInstance().setActive(true)
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func updateAutoCaps() {
    guard boardMode == .alphabet else { return }
    updateAutoCaps(before: String((textDocumentProxy.documentContextBeforeInput ?? "").suffix(256)))
  }

  private func updateAutoCaps(before: String) {
    guard boardMode == .alphabet else { return }
    let wanted = capMode.appliesAt(before)
    if !wanted { autoShiftDismissed = false }
    let nextAuto = wanted && !autoShiftDismissed && shiftState == .off
    if nextAuto != isAutoShifted {
      isAutoShifted = nextAuto
      refreshLetterTitles()
      refreshShiftIcon()
    }
  }

  private func toggleShift() {
    let now = ProcessInfo.processInfo.systemUptime
    let doubleTap = now - lastShiftTapTime <= Self.shiftDoubleTapInterval
    lastShiftTapTime = now
    switch shiftState {
    case .locked:
      shiftState = .off
    case .once:
      shiftState = doubleTap ? .locked : .off
    case .off:
      if doubleTap {
        shiftState = .locked
      } else if isAutoShifted {
        autoShiftDismissed = true
      } else {
        shiftState = .once
      }
    }
    isAutoShifted = false
    refreshLetterTitles()
    refreshShiftIcon()
  }

  private func resetShift() {
    let changed = shiftState != .off || isAutoShifted
    shiftState = .off
    isAutoShifted = false
    if changed {
      refreshLetterTitles()
      refreshShiftIcon()
    }
  }

  private func buildKeyboard() {
    heightConstraint = view.heightAnchor.constraint(
      greaterThanOrEqualToConstant: desiredKeyboardHeight())
    heightConstraint?.priority = .defaultHigh
    heightConstraint?.isActive = true
    rebuildKeyboard()
  }

  private var pickerSearchActive: Bool { pickerSearchScope != nil }

  private var emojiSearchDocumentState: EmojiSearchDocumentState {
    EmojiSearchDocumentState(
      documentID: textDocumentProxy.documentIdentifier,
      before: textDocumentProxy.documentContextBeforeInput,
      after: textDocumentProxy.documentContextAfterInput,
      selectedText: textDocumentProxy.selectedText)
  }

  private var shouldKeepPickerSearchForOwnInsertion: Bool {
    guard pickerSearchScope == .emoji else { return false }
    if isApplyingKeyboardText || isMutatingTranslationDocument { return true }
    return expectedEmojiSearchDocument?.matches(emojiSearchDocumentState) == true
  }

  private var shouldKeepRecentAlternateUnit: Bool {
    guard let unit = recentAlternateUnit else { return false }
    if isApplyingKeyboardText { return true }
    return textDocumentProxy.documentIdentifier == unit.document
      && textDocumentProxy.selectedText?.isEmpty != false
      && (textDocumentProxy.documentContextBeforeInput ?? "").hasSuffix(unit.text)
  }

  private func beginPickerSearch(_ scope: PickerSearchScope, returnMode: FeatureMode) {
    expectedEmojiSearchDocument = nil
    pickerSearchScope = scope
    pickerSearchQuery = ""
    pickerSearchReturnMode = returnMode
    if scope == .emoji { boardMode = .alphabet }
    featureMode = normalMode(for: returnMode)
    rebuildKeyboard()
  }

  private func normalMode(for pickerMode: FeatureMode) -> FeatureMode {
    switch pickerMode {
    case .languagePicker: return .translate
    case .ttsLanguagePicker: return .tts
    case .sttLanguagePicker: return .stt
    case .dictionaryLanguagePicker: return .dictionary
    case .emoji: return .keyboard
    default: return pickerMode
    }
  }

  private func closePickerSearch(overrideReturnMode: FeatureMode? = nil) {
    featureMode = overrideReturnMode ?? pickerSearchReturnMode ?? .keyboard
    pickerSearchScope = nil
    pickerSearchQuery = ""
    pickerSearchReturnMode = nil
    rebuildKeyboard()
  }

  private func pickerSearchOptions() -> [(String, String)] {
    switch pickerSearchScope {
    case .translateSource: return supportedSourceLanguages.map { ($0.name, $0.code) }
    case .translateTarget: return supportedTargetLanguages.map { ($0.name, $0.code) }
    case .ttsLanguage: return supportedTtsLanguages.map { ($0.name, $0.code) }
    case .ttsVoice: return voicesForTtsLanguage().map { ($0, $0) }
    case .sttLanguage: return supportedSttLanguages.map { ($0.name, $0.code) }
    case .dictionaryLanguage: return dictionarySupportedLanguages().map { ($0.name, $0.code) }
    case .emoji, .none: return []
    }
  }

  private func updatePickerSearchQuery(_ value: String) {
    guard pickerSearchActive else { return }
    pickerSearchQuery.append(value)
    refreshPickerSearchView()
  }

  private func deletePickerSearchCharacter() {
    guard pickerSearchActive, !pickerSearchQuery.isEmpty else { return }
    pickerSearchQuery.removeLast()
    refreshPickerSearchView()
  }

  private func refreshPickerSearchView() {
    guard let old = pickerSearchView else {
      rebuildKeyboard()
      return
    }
    let new = makePickerSearchView()
    new.frame = old.frame
    view.insertSubview(new, aboveSubview: old)
    old.removeFromSuperview()
    pickerSearchView = new
  }

  private func selectPickerSearchOption(_ value: String) {
    let returnMode = pickerSearchReturnMode
    let previousDictionaryLanguageCode = dictionaryLanguageCode
    switch pickerSearchScope {
    case .translateSource:
      if let language = supportedSourceLanguages.first(where: {
        $0.code.caseInsensitiveCompare(value) == .orderedSame
      }) {
        sourceLanguageCode = language.code
        sourceLanguageName = language.name
        saveSharedLanguageSettings(
          translateSourceLanguage: sourceLanguageName, translateTargetLanguage: targetLanguageName)
        discardTranslationUndo(refreshUI: false)
      }
    case .translateTarget:
      if let language = supportedTargetLanguages.first(where: {
        $0.code.caseInsensitiveCompare(value) == .orderedSame
      }) {
        targetLanguageCode = language.code
        targetLanguageName = language.name
        saveSharedLanguageSettings(
          translateSourceLanguage: sourceLanguageName, translateTargetLanguage: targetLanguageName)
        discardTranslationUndo(refreshUI: false)
      }
    case .ttsLanguage:
      if let language = supportedTtsLanguages.first(where: {
        $0.code.caseInsensitiveCompare(value) == .orderedSame
      }) {
        setTtsLanguage(language)
      }
    case .ttsVoice: saveSelectedVoice(value)
    case .sttLanguage:
      if let language = supportedSttLanguages.first(where: {
        $0.code.caseInsensitiveCompare(value) == .orderedSame
      }) {
        selectedSttLanguageCode = language.code
        selectedSttLanguageName = language.name
      }
    case .dictionaryLanguage:
      if let language = dictionarySupportedLanguages().first(where: {
        $0.code.caseInsensitiveCompare(value) == .orderedSame
      }) {
        dictionaryLanguageCode = language.code
        dictionaryLanguageName = language.name
        saveSharedLanguageSettings(dictionaryLanguage: language.name)
        clearToolbarError(.dictionary)
      }
    case .emoji:
      insertEmoji(value)
      recentEmojiStore.record(value)
      return
    case .none: return
    }
    let scope = pickerSearchScope
    pickerSearchScope = nil
    pickerSearchQuery = ""
    pickerSearchReturnMode = nil
    featureMode = returnMode ?? .keyboard
    rebuildKeyboard(resetPickerScrollKeys: pickerScrollKeysToReset(for: scope))

    if scope == .dictionaryLanguage {
      autoLookupAfterDictionaryLanguageChange(previousCode: previousDictionaryLanguageCode)
    }
  }

  private func pickerScrollKeysToReset(for scope: PickerSearchScope?) -> Set<String> {
    switch scope {
    case .translateSource: return ["translate-source"]
    case .translateTarget: return ["translate-target"]
    case .ttsLanguage: return ["tts-language", "tts-voice"]
    case .ttsVoice: return ["tts-voice"]
    case .sttLanguage: return ["stt-language"]
    case .dictionaryLanguage: return ["dictionary-language"]
    case .emoji, .none: return []
    }
  }

  private func rebuildKeyboard(resetPickerScrollKeys: Set<String> = []) {
    heightConstraint?.constant = desiredKeyboardHeight()
    isApplyingKeyboardText = false
    dismissKeyPreview()
    if fullPanelView != nil, isPickerFeatureMode(featureMode) {
      capturePickerScrollOffsets(from: fullPanelView)
      resetPickerScrollKeys.forEach { pickerScrollOffsets.removeValue(forKey: $0) }
    }
    stopDeleteRepeat(refreshUI: false)
    endCursorTrackpad()
    if let emojiPanel = fullPanelView as? EmojiPanelView {
      emojiCategoryIndex = emojiPanel.selectedCategoryIndex
    }
    buttonByKey.removeAll()
    appliedLetterCaseIsShifted = nil
    appliedReturnKeyType = nil
    toolbarIconViews.removeAll()
    dictionaryListenButtons.removeAll()
    recycleKeyButtons()
    keyHost?.setKeys([])
    keyHost?.removeFromSuperview()
    keyHost = nil
    keyGlassContainer = nil
    modeBar?.removeFromSuperview()
    translateHeaderView?.removeFromSuperview()
    dictionaryHeaderView?.removeFromSuperview()
    pickerSearchView?.removeFromSuperview()
    fullPanelView?.removeFromSuperview()
    boardPanelView?.removeFromSuperview()
    modeBar = nil
    translateHeaderView = nil
    dictionaryHeaderView = nil
    pickerSearchView = nil
    fullPanelView = nil
    boardPanelView = nil

    switch featureMode {
    case .languagePicker:
      showFullPanel(makeLanguagePickerView())
      return
    case .thinkingView:
      showFullPanel(makeThinkingView())
      return
    case .ttsLanguagePicker:
      showFullPanel(makeTtsLanguageVoicePickerView())
      return
    case .sttLanguagePicker:
      showFullPanel(makeSttLanguagePickerView())
      return
    case .dictionaryLanguagePicker:
      showFullPanel(makeDictionaryLanguagePickerView())
      return
    case .dictionaryResult:
      showFullPanel(makeDictionaryResultView())
      return
    case .keyboardLanguagePicker:
      showFullPanel(makeKeyboardLanguagePickerView())
      return
    case .loginRequired:
      showFullPanel(makeLoginRequiredCard())
      return
    case .emoji:
      showFullPanel(makeEmojiPanel())
      return
    case .keyboard, .translate, .stt, .tts, .dictionary, .clipboard, .textEditing:
      break
    }

    switch featureMode {
    case .keyboard:
      if pickerSearchActive {
        let search = makePickerSearchView()
        pickerSearchView = search
        view.addSubview(search)
        break
      }
      let newModeBar = makeModeBar()
      modeBar = newModeBar
      view.addSubview(newModeBar)
      if displayedToolbarWasPrediction != predictionBarIsVisible {
        animateToolbarEntry(newModeBar, showingPredictions: predictionBarIsVisible)
      }
      displayedToolbarWasPrediction = predictionBarIsVisible
    case .clipboard:
      let header = makeClipboardHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .textEditing:
      let header = makeTextEditingHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .translate:
      if pickerSearchActive {
        let search = makePickerSearchView()
        pickerSearchView = search
        view.addSubview(search)
      }
      let header = makeTranslateHeader()
      translateHeaderView = header
      if !pickerSearchActive { view.addSubview(header) }
    case .stt:
      if pickerSearchActive {
        let search = makePickerSearchView()
        pickerSearchView = search
        view.addSubview(search)
      }
      let header = makeSttHeader()
      translateHeaderView = header
      if !pickerSearchActive { view.addSubview(header) }
    case .tts:
      if pickerSearchActive {
        let search = makePickerSearchView()
        pickerSearchView = search
        view.addSubview(search)
      }
      let header = makeTtsHeader()
      translateHeaderView = header
      if !pickerSearchActive { view.addSubview(header) }
    case .dictionary:
      if pickerSearchActive {
        let search = makePickerSearchView()
        pickerSearchView = search
        view.addSubview(search)
      }
      let header = makeDictionaryHeader()
      dictionaryHeaderView = header
      if !pickerSearchActive { view.addSubview(header) }
    default: break
    }

    if let panel = boardPanel() {
      boardPanelView = panel
      view.addSubview(panel)
      currentRows = []
      applyTheme()
      view.setNeedsLayout()
      return
    }

    switch boardMode {
    case .alphabet: buildAlphaRows()
    case .symbols, .symbolsExtended: buildSymbolRows()
    case .numeric: buildNumericRows()
    }
    if boardMode != .numeric {
      buildThirdRowKeys()
      buildBottomRowKeys()
    }
    keyHost?.setKeys(keyButtons)
    applyTheme()
    updateAutoCaps()
    view.setNeedsLayout()
  }

  private func boardPanel() -> UIView? {
    if isToolsPanelOpen { return makeToolsPanel() }
    if featureMode == .clipboard { return makeClipboardPanel() }
    if featureMode == .textEditing { return makeTextEditingPanel() }
    return nil
  }

  private func showFullPanel(_ panel: UIView) {
    fullPanelView = panel
    view.addSubview(panel)
    applyTheme()
    view.setNeedsLayout()
  }

  private func isPickerFeatureMode(_ mode: FeatureMode) -> Bool {
    switch mode {
    case .languagePicker, .ttsLanguagePicker, .sttLanguagePicker, .dictionaryLanguagePicker,
      .keyboardLanguagePicker:
      return true
    default:
      return false
    }
  }

  private func capturePickerScrollOffsets(from root: UIView?) {
    guard let root else { return }
    if let scroll = root as? KeyboardPickerScrollView, let key = scroll.scrollOffsetKey {
      pickerScrollOffsets[key] = scroll.contentOffset.y
    }
    root.subviews.forEach { capturePickerScrollOffsets(from: $0) }
  }

  private func schedulePickerScrollRestore(for scroll: KeyboardPickerScrollView) {
    guard let key = scroll.scrollOffsetKey else { return }
    if let offset = pickerScrollOffsets[key] {
      DispatchQueue.main.async { [weak scroll] in
        guard let scroll else { return }
        scroll.layoutIfNeeded()
        let maxY = max(0, scroll.contentSize.height - scroll.bounds.height)
        scroll.setContentOffset(CGPoint(x: 0, y: min(offset, maxY)), animated: false)
      }
    } else {
      DispatchQueue.main.async { [weak scroll] in
        guard let scroll else { return }
        scroll.layoutIfNeeded()
        if let stack = scroll.subviews.first(where: { $0 is UIStackView }) as? UIStackView,
          let selectedBtn = stack.arrangedSubviews.first(where: {
            ($0 as? UIButton)?.isSelected == true
          })
        {
          let btnFrame = selectedBtn.convert(selectedBtn.bounds, to: scroll)
          let targetY = btnFrame.midY - scroll.bounds.height / 2
          let maxY = max(0, scroll.contentSize.height - scroll.bounds.height)
          scroll.setContentOffset(CGPoint(x: 0, y: max(0, min(targetY, maxY))), animated: true)
        }
      }
    }
  }

  private func refreshOpenPickerSelections() {
    guard let panel = fullPanelView else { return }
    switch featureMode {
    case .languagePicker:
      refreshSelectionButtons(in: panel, prefix: "picker:translate-source:") {
        $0.caseInsensitiveCompare(sourceLanguageCode) == .orderedSame
      }
      refreshSelectionButtons(in: panel, prefix: "picker:translate-target:") {
        $0.caseInsensitiveCompare(targetLanguageCode) == .orderedSame
      }
      refreshTranslateSwapButton(in: panel)
    case .ttsLanguagePicker:
      refreshSelectionButtons(in: panel, prefix: "picker:tts-language:") {
        $0.caseInsensitiveCompare(resolvedTtsLanguage().code) == .orderedSame
      }
      refreshSelectionButtons(in: panel, prefix: "picker:tts-voice:") {
        $0.caseInsensitiveCompare(resolvedTtsVoice()) == .orderedSame
      }
    case .sttLanguagePicker:
      refreshSelectionButtons(in: panel, prefix: "picker:stt-language:", showsCheckmark: true) {
        $0.caseInsensitiveCompare(selectedSttLanguageCode) == .orderedSame
      }
    case .dictionaryLanguagePicker:
      refreshSelectionButtons(in: panel, prefix: "picker:dictionary-language:") {
        $0.caseInsensitiveCompare(dictionaryLanguageCode) == .orderedSame
      }
    case .keyboardLanguagePicker:
      refreshSelectionButtons(in: panel, prefix: "picker:keyboard-language:") {
        $0.caseInsensitiveCompare(keyboardLanguageCode) == .orderedSame
      }
    default:
      break
    }
  }

  private func refreshSelectionButtons(
    in view: UIView,
    prefix: String,
    showsCheckmark: Bool = false,
    isSelected: (String) -> Bool
  ) {
    if let button = view as? KeyboardSelectionButton,
      let identifier = view.accessibilityIdentifier,
      identifier.hasPrefix(prefix)
    {
      let code = String(identifier.dropFirst(prefix.count))
      button.applySelectionState(
        isSelected(code), theme: settings.theme, showsCheckmark: showsCheckmark)
    }
    view.subviews.forEach {
      refreshSelectionButtons(
        in: $0, prefix: prefix, showsCheckmark: showsCheckmark, isSelected: isSelected)
    }
  }

  private func refreshTranslateSwapButton(in view: UIView) {
    if view.accessibilityIdentifier == "picker:translate-swap", let button = view as? UIButton {
      let enabled = canSwapTranslateLanguages()
      button.isEnabled = enabled
      button.alpha = enabled ? 1 : 0.4
      return
    }
    view.subviews.forEach { refreshTranslateSwapButton(in: $0) }
  }

  private func updateUI() {
    guard fullPanelView == nil else {
      rebuildKeyboard()
      return
    }
    translateHeaderView?.removeFromSuperview()
    dictionaryHeaderView?.removeFromSuperview()
    translateHeaderView = nil
    dictionaryHeaderView = nil

    switch featureMode {
    case .clipboard:
      let header = makeClipboardHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .textEditing:
      let header = makeTextEditingHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .translate:
      let header = makeTranslateHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .stt:
      let header = makeSttHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .tts:
      let header = makeTtsHeader()
      translateHeaderView = header
      view.addSubview(header)
    case .dictionary:
      let header = makeDictionaryHeader()
      dictionaryHeaderView = header
      view.addSubview(header)
    default: break
    }
    applyTheme()
    applyToolbarTheme()
    view.setNeedsLayout()
  }

  private func makeModeBar() -> UIStackView {
    predictionBarIsVisible = false
    if toolbarErrors[.modeBar] == nil && settings.predictiveBarEnabled
      && !showModeBarUntilNextTyping && !currentPredictionEntries().isEmpty
    {
      return makePredictionBar()
    }
    predictionButtons.removeAll()
    let row = UIStackView()
    row.translatesAutoresizingMaskIntoConstraints = true
    row.axis = .horizontal
    row.alignment = .center
    row.distribution = .equalSpacing
    row.spacing = keyGap
    row.isLayoutMarginsRelativeArrangement = true
    row.layoutMargins = UIEdgeInsets(
      top: 0, left: toolbarSideInset, bottom: 0, right: toolbarSideInset)

    let keys =
      toolOrder.prefix(KeyboardTool.toolbarCount).map { $0.iconKey } + ["mode-more"]
    row.addArrangedSubview(makeToolbarIcon(key: keys[0]))
    if let err = toolbarErrors[.modeBar] {
      row.addArrangedSubview(makeInlineErrorLabel(err, slot: .modeBar))
    }
    keys.dropFirst().forEach { row.addArrangedSubview(makeToolbarIcon(key: $0)) }
    return row
  }

  private func refreshModeBarInPlace() {
    guard featureMode == .keyboard else { return }
    modeBar?.removeFromSuperview()
    toolbarIconViews.removeAll()
    let bar = makeModeBar()
    modeBar = bar
    view.addSubview(bar)
    layoutModeBar()
    applyToolbarTheme()
  }

  private var showModeBarUntilNextTyping = false
  private var predictionBarIsVisible = false
  private var predictionButtons: [UIButton] = []
  private var displayedToolbarWasPrediction: Bool?

  private enum PredictionAction {
    case insertWord
    case undoAutocorrection
  }

  private struct PredictionEntry {
    let title: String
    let action: PredictionAction
  }

  private enum PredictionSlot {
    case word(PredictionEntry)
    case emoji([(sequence: String, name: String)])
    case empty
  }

  private func currentPredictionSlots() -> [PredictionSlot] {
    var slots = unfittedPredictionSlots().filter {
      if case .empty = $0 { return false }
      return true
    }
    let available = view.bounds.width - 2 * sideMargin - 42
    let font = UIFont.systemFont(ofSize: 15, weight: .medium)
    func fits() -> Bool {
      let share = available / CGFloat(slots.count)
      return slots.allSatisfy {
        guard case .word(let entry) = $0 else { return true }
        let dot: CGFloat = modelSuggestions.contains(entry.title) ? 8 : 0
        return (entry.title as NSString).size(withAttributes: [.font: font]).width + 16 + dot <= share
      }
    }
    while available > 0, !fits(),
      let last = slots.lastIndex(where: { if case .word = $0 { return true } else { return false } })
    {
      slots.remove(at: last)
    }
    return slots.isEmpty ? [.empty] : slots
  }

  private func unfittedPredictionSlots() -> [PredictionSlot] {
    let wordEntries = currentPredictionEntries()

    let context = cursorContext()
    let word = context.currentWord

    let emojiWord = word.isEmpty ? context.previousWord : word
    let lastSlotFree =
      !word.isEmpty || !wordEntries.indices.contains(2)
      || modelSuggestions.contains(wordEntries[2].title)
    if featureMode == .keyboard,
       context.mode.allowsPrediction,
       lastSlotFree,
       emojiWord.count >= 3,
       emojiWord.allSatisfy({ $0.isLetter }),
       emojiRepository.isReady {
      let matches = emojiRepository.suggest(word: emojiWord, recentStore: recentEmojiStore, limit: 3)
      if !matches.isEmpty {
        var slots: [PredictionSlot] = []
        slots.append(wordEntries.indices.contains(0) ? .word(wordEntries[0]) : .empty)
        slots.append(wordEntries.indices.contains(1) ? .word(wordEntries[1]) : .empty)
        slots.append(.emoji(matches))
        return slots
      }
    }
    
    return (0..<3).map { i in wordEntries.indices.contains(i) ? .word(wordEntries[i]) : .empty }
  }

  private var displayedPredictionSlotsShape: [Bool] = []

  private func makePredictionBar() -> UIStackView {
    predictionBarIsVisible = true
    predictionButtons.removeAll()
    let row = UIStackView()
    row.translatesAutoresizingMaskIntoConstraints = true
    row.axis = .horizontal
    row.alignment = .center
    row.distribution = .fill
    row.spacing = 0
    row.layoutMargins = UIEdgeInsets(top: 0, left: sideMargin, bottom: 0, right: sideMargin)
    row.isLayoutMarginsRelativeArrangement = true

    let suggestions = UIStackView()
    suggestions.axis = .horizontal
    suggestions.alignment = .fill
    suggestions.distribution = .fillEqually
    suggestions.spacing = 0
    
    let slots = currentPredictionSlots()
    displayedPredictionSlotsShape = slots.map {
      if case .emoji = $0 { return true }
      return false
    }

    for (index, slot) in slots.enumerated() {
      switch slot {
      case .word(let entry):
        suggestions.addArrangedSubview(
          makeNativeSuggestionSlot(
            entry.title, index: index,
            showsDivider: index < slots.count - 1))
      case .empty:
        suggestions.addArrangedSubview(
          makeNativeSuggestionSlot(
            "", index: index,
            showsDivider: index < slots.count - 1))
      case .emoji(let emojis):
        suggestions.addArrangedSubview(
          makeEmojiSuggestionSlot(
            emojis, index: index,
            showsDivider: index < slots.count - 1))
      }
    }
    row.addArrangedSubview(suggestions)

    let modes = UIButton(type: .system)
    modes.setImage(sfSymbol("xmark.circle", size: 19), for: .normal)
    modes.tintColor = .label
    modes.accessibilityLabel = "Cancel suggestions"
    modes.widthAnchor.constraint(equalToConstant: 42).isActive = true
    modes.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.showModeBarUntilNextTyping = true
        self.rebuildKeyboard()
      }, for: .touchUpInside)
    row.addArrangedSubview(modes)
    return row
  }

  private func makeNativeSuggestionSlot(_ suggestion: String, index: Int, showsDivider: Bool)
    -> UIView
  {
    let slot = UIView()
    let button = UIButton(type: .system)
    button.translatesAutoresizingMaskIntoConstraints = false
    button.backgroundColor = .clear
    button.setTitle(suggestion, for: .normal)
    button.setImage(modelSuggestions.contains(suggestion) ? modelDot : nil, for: .normal)
    button.setTitleColor(.label, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
    button.titleLabel?.lineBreakMode = .byTruncatingTail
    button.accessibilityLabel = suggestion.isEmpty ? nil : "Insert \(suggestion)"
    button.isEnabled = !suggestion.isEmpty
    button.addAction(
      UIAction { [weak self] _ in
        self?.selectPrediction(at: index)
      }, for: .touchUpInside)
    slot.addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: slot.leadingAnchor, constant: 4),
      button.trailingAnchor.constraint(equalTo: slot.trailingAnchor, constant: -4),
      button.topAnchor.constraint(equalTo: slot.topAnchor),
      button.bottomAnchor.constraint(equalTo: slot.bottomAnchor),
    ])
    predictionButtons.append(button)

    if showsDivider {
      let divider = UIView()
      divider.translatesAutoresizingMaskIntoConstraints = false
      divider.backgroundColor = UIColor.separator.withAlphaComponent(0.45)
      slot.addSubview(divider)
      NSLayoutConstraint.activate([
        divider.trailingAnchor.constraint(equalTo: slot.trailingAnchor),
        divider.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
        divider.widthAnchor.constraint(equalToConstant: 0.5),
        divider.heightAnchor.constraint(equalToConstant: 24),
      ])
    }
    return slot
  }

  private func makeEmojiSuggestionSlot(_ emojis: [(sequence: String, name: String)], index: Int, showsDivider: Bool) -> UIView {
    let slot = UIView()
    
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.alignment = .fill
    stack.distribution = .fillEqually
    stack.spacing = 0
    
    for emoji in emojis {
      let button = UIButton(type: .system)
      button.setTitle(emoji.sequence, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 20)
      button.accessibilityLabel = emoji.name
      button.addAction(
        UIAction { [weak self] _ in
          self?.insertEmojiSuggestion(emoji.sequence)
        }, for: .touchUpInside)
      stack.addArrangedSubview(button)
    }
    
    slot.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: slot.leadingAnchor, constant: 4),
      stack.trailingAnchor.constraint(equalTo: slot.trailingAnchor, constant: -4),
      stack.topAnchor.constraint(equalTo: slot.topAnchor),
      stack.bottomAnchor.constraint(equalTo: slot.bottomAnchor),
    ])
    
    if showsDivider {
      let divider = UIView()
      divider.translatesAutoresizingMaskIntoConstraints = false
      divider.backgroundColor = UIColor.separator.withAlphaComponent(0.45)
      slot.addSubview(divider)
      NSLayoutConstraint.activate([
        divider.trailingAnchor.constraint(equalTo: slot.trailingAnchor),
        divider.centerYAnchor.constraint(equalTo: slot.centerYAnchor),
        divider.widthAnchor.constraint(equalToConstant: 0.5),
        divider.heightAnchor.constraint(equalToConstant: 24),
      ])
    }
    return slot
  }

  private func animateToolbarEntry(_ toolbar: UIView, showingPredictions: Bool) {
    toolbar.alpha = 0
    toolbar.transform = CGAffineTransform(translationX: showingPredictions ? 14 : -14, y: 0)
    UIView.animate(
      withDuration: 0.24,
      delay: 0,
      usingSpringWithDamping: 0.9,
      initialSpringVelocity: 0.25,
      options: [.allowUserInteraction, .beginFromCurrentState]
    ) {
      toolbar.alpha = 1
      toolbar.transform = .identity
    }
  }

  private func refreshPredictionBarIfNeeded() {
    guard featureMode == .keyboard else { return }
    let shouldShow =
      settings.predictiveBarEnabled && !showModeBarUntilNextTyping
      && !currentPredictionEntries().isEmpty
    guard shouldShow != predictionBarIsVisible else { return }
    swapToolbar()
  }

  private func swapToolbar() {
    modeBar?.removeFromSuperview()
    toolbarIconViews.removeAll()
    let newModeBar = makeModeBar()
    modeBar = newModeBar
    view.addSubview(newModeBar)
    if displayedToolbarWasPrediction != predictionBarIsVisible {
      animateToolbarEntry(newModeBar, showingPredictions: predictionBarIsVisible)
    }
    displayedToolbarWasPrediction = predictionBarIsVisible
    applyToolbarTheme()
    layoutModeBar()
  }

  private func makeToolbarIcon(key: String) -> ToolbarIconView {
    let v = ToolbarIconView(key: key, image: iconImage(for: key))
    v.addTarget(self, action: #selector(toolbarIconTapped(_:)), for: .touchUpInside)
    toolbarIconViews[key] = v
    return v
  }

  @objc private func toolbarIconTapped(_ sender: ToolbarIconView) {
    guard let key = toolbarIconViews.first(where: { $0.value === sender })?.key else { return }
    if key == "mode-more" {
      isToolsPanelOpen.toggle()
      rebuildKeyboard()
    } else if let tool = KeyboardTool.tool(forIconKey: key) {
      activateTool(tool)
    }
    playKeyFeedback()
  }

  private func activateTool(_ tool: KeyboardTool) {
    isToolsPanelOpen = false
    switch tool {
    case .translate:
      featureMode = (featureMode == .translate) ? .keyboard : .translate

    case .dictionary:
      if featureMode == .dictionary || featureMode == .dictionaryLanguagePicker
        || featureMode == .dictionaryResult
      {
        dictionaryTask?.cancel()
        isDictionaryLoading = false
        lastSentDictionarySourceText = nil
        clearToolbarError(.dictionary)
        featureMode = .keyboard
      } else {
        featureMode = .dictionary
      }

    case .voice:
      stopTts()
      sttCapturedText = ""
      sttFullRecording = Data()
      sttRecordedWav = nil
      hasSttRecordingReady = false
      featureMode = .stt

    case .speak:
      if isTtsPlaying || isTtsLoading {
        stopTts()
        featureMode = .keyboard
        break
      }
      featureMode = .tts

    case .clipboard:
      openClipboard()

    case .textEditing:
      openTextEditing()

    case .languages:
      featureMode = .keyboardLanguagePicker

    case .emoji:
      if featureMode == .emoji { featureMode = .keyboard } else { openEmojiPanel() }

    case .settings:
      openHostAppForSettings()
    }
    rebuildKeyboard()
  }

  private func openClipboard() {
    if hasFullAccess {
      KeyboardClipStore.shared.optIn()
      KeyboardClipStore.shared.captureCurrentClip()
    }
    isClipboardEditMode = false
    featureMode = (featureMode == .clipboard) ? .keyboard : .clipboard
  }

  private func openTextEditing() {
    finishTextEditingSelection()
    featureMode = (featureMode == .textEditing) ? .keyboard : .textEditing
    updateTextEditingState()
  }

  private func updateTextEditingState() {
    guard featureMode == .textEditing, let textPanel = boardPanelView as? TextEditingPanelView else { return }
    let proxy = textDocumentProxy
    let before = proxy.documentContextBeforeInput ?? ""
    let after = proxy.documentContextAfterInput ?? ""
    let hasSelection = proxy.selectedText != nil && !proxy.selectedText!.isEmpty
    let hasText = !before.isEmpty || !after.isEmpty || hasSelection
    let hasClipboard = hasFullAccess && UIPasteboard.general.hasStrings
    textPanel.update(hasText: hasText, hasSelection: hasSelection, hasClipboardContent: hasClipboard, isSelecting: isTextEditingSelectMode)
  }

  private func refreshTextEditingStateAfterHostMutation() {
    updateTextEditingState()
    DispatchQueue.main.async { [weak self] in
      self?.updateTextEditingState()
    }
  }

  private func captureClipOnAppearance() {
    guard hasFullAccess, KeyboardClipStore.shared.isOptedIn else { return }
    KeyboardClipStore.shared.captureCurrentClip()
  }

  private func pasteClip(_ text: String) {
    if hasFullAccess { KeyboardClipStore.shared.setCurrentClip(text) }
    discardTranslationUndo()
    correctionLedger.settle()
    textDocumentProxy.insertText(text)
    appendToLocalTextCache(text)
    updateAutoCaps()
  }

  private func makeSttHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear
    let cancel = makeCancelButton { [weak self] in
      self?.stopSttListening()
      self?.stopSttPreview()
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let centerView: UIView
    if let err = toolbarErrors[.stt] {
      centerView = makeInlineErrorLabel(err, slot: .stt)
    } else if isSttProcessing {
      let label = UILabel()
      label.translatesAutoresizingMaskIntoConstraints = false
      label.text = "Processing…"
      label.textColor = settings.theme.accent
      label.textAlignment = .center
      label.font = .systemFont(ofSize: max(settings.fontSize - 1, 12), weight: .medium)
      centerView = label
      sttLiveLabel = label
    } else if isSttListening || isSttStarting {
      let label = UILabel()
      label.translatesAutoresizingMaskIntoConstraints = false
      label.text = sttCapturedText.isEmpty ? "Listening…" : sttCapturedText
      label.textColor = isSttListening ? settings.theme.accent : settings.theme.label
      label.textAlignment = .center
      label.lineBreakMode = .byTruncatingHead
      label.font = .systemFont(ofSize: max(settings.fontSize - 1, 12), weight: .medium)
      centerView = label
      sttLiveLabel = label
    } else if hasSttRecordingReady {
      centerView = makeSttAudioControls()
    } else {
      centerView = makePillButton(
        title: selectedSttLanguageName, background: settings.theme.key,
        foreground: settings.theme.label, minWidth: 104
      ) { [weak self] in
        guard let self else { return }
        self.featureMode = .sttLanguagePicker
        self.rebuildKeyboard()
      }
    }
    header.addSubview(centerView)

    let actionButton = makeRoundBaseButton(background: settings.theme.key, size: 32)
    if isSttStarting || isSttProcessing {
      embedSpinner(in: actionButton, color: settings.theme.label)
    } else if isSttListening {
      actionButton.backgroundColor = UIColor(hex: "#EF4444")
      actionButton.setImage(sfSymbol("stop.fill", size: 13), for: .normal)
      actionButton.tintColor = .white
      actionButton.addAction(
        UIAction { [weak self] _ in self?.stopSttRecording() }, for: .touchUpInside)
    } else if hasSttRecordingReady {
      actionButton.backgroundColor = settings.theme.accent
      actionButton.setImage(sfSymbol("paperplane.fill", size: 13), for: .normal)
      actionButton.tintColor = .white
      actionButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      actionButton.addAction(
        UIAction { [weak self] _ in
          self?.stopSttPreview()
          self?.submitAsrRecording()
        }, for: .touchUpInside)
    } else {
      let micImg =
        UIImage(named: "ic_audio_mic")?.withRenderingMode(.alwaysTemplate)
        ?? UIImage(systemName: "mic.fill")?.withRenderingMode(.alwaysTemplate)
      actionButton.setImage(micImg, for: .normal)
      actionButton.tintColor = settings.theme.label
      actionButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      actionButton.addAction(
        UIAction { [weak self] _ in
          self?.startSttListening()
          self?.rebuildKeyboard()
        }, for: .touchUpInside)
    }
    header.addSubview(actionButton)
    applyHeaderConstraints(header: header, cancel: cancel, center: centerView, action: actionButton)
    return header
  }

  private func makeSttAudioControls() -> UIView {
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 8
    stack.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: KeySurface.cardRadius,
      tint: KeySurface.glyphTint)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 3, left: 6, bottom: 3, right: 6)

    let playPause = makeRoundBaseButton(background: .clear, size: 26)
    playPause.setImage(
      sfSymbol(isSttPreviewPlaying ? "pause.fill" : "play.fill", size: 11), for: .normal)
    playPause.tintColor = settings.theme.label
    playPause.contentEdgeInsets = UIEdgeInsets(top: 7, left: 7, bottom: 7, right: 7)
    playPause.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        if self.isSttPreviewPlaying {
          self.pauseSttPreview()
          self.rebuildKeyboard()
        } else {
          self.playSttPreview()
        }
      }, for: .touchUpInside)

    let wave = WaveformView(barCount: 9, barMaxHeight: 16, color: settings.theme.accent)
    wave.usesAnimatedWaveform = useAnimatedWaveform
    wave.setAnimating(isSttPreviewPlaying)
    wave.widthAnchor.constraint(equalToConstant: 80).isActive = true
    wave.heightAnchor.constraint(equalToConstant: 22).isActive = true

    let share = makeShareControlButton { [weak self] in self?.shareSttRecording() }

    let clear = makeRoundBaseButton(background: .clear, size: 26)
    clear.setImage(
      UIImage(named: "ic_clear_text")?.withRenderingMode(.alwaysTemplate)
        ?? sfSymbol("xmark", size: 11), for: .normal)
    clear.tintColor = settings.theme.label
    clear.contentEdgeInsets = UIEdgeInsets(top: 7, left: 7, bottom: 7, right: 7)
    clear.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.stopSttPreview()
        self.hasSttRecordingReady = false
        self.sttRecordedWav = nil
        self.sttFullRecording = Data()
        self.rebuildKeyboard()
      }, for: .touchUpInside)

    stack.addArrangedSubview(playPause)
    stack.addArrangedSubview(wave)
    stack.addArrangedSubview(share)
    stack.addArrangedSubview(clear)
    return stack
  }

  private func playSttPreview() {
    guard let wav = sttRecordedWav, !isSttPreviewPlaying else { return }
    do {
      try activatePlaybackAudioSession()
      if sttPreviewPlayer == nil || sttPreviewPlayer?.data != wav {
        sttPreviewPlayer = try AVAudioPlayer(data: wav)
        sttPreviewPlayer?.delegate = self
        sttPreviewPlayer?.prepareToPlay()
      }
      sttPreviewPlayer?.play()
      isSttPreviewPlaying = true
      rebuildKeyboard()
      devLog("[STT] ▶ Preview playback started")
    } catch {
      devLog("[STT] ✗ Preview playback error: %@", error.localizedDescription)
      isSttPreviewPlaying = false
    }
  }

  private func pauseSttPreview() {
    guard isSttPreviewPlaying else { return }
    sttPreviewPlayer?.pause()
    isSttPreviewPlaying = false
    deactivateAudioSession()
    devLog("[STT] ⏸ Preview paused")
  }

  private func stopSttPreview() {
    sttPreviewPlayer?.stop()
    sttPreviewPlayer = nil
    isSttPreviewPlaying = false
    deactivateAudioSession()
    devLog("[STT] ■ Preview stopped")
  }

  private func makeTtsHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear
    let cancel = makeCancelButton { [weak self] in
      self?.stopTts()
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let centerView: UIView
    if let err = toolbarErrors[.tts] {
      centerView = makeInlineErrorLabel(err, slot: .tts)
    } else if isTtsLoading {
      let stack = UIStackView()
      stack.translatesAutoresizingMaskIntoConstraints = false
      stack.axis = .horizontal
      stack.alignment = .center
      stack.spacing = 8
      let spinner = UIActivityIndicatorView(style: .medium)
      spinner.color = settings.theme.accent
      spinner.startAnimating()
      let label = UILabel()
      label.text = "Generating…"
      label.textColor = settings.theme.accent
      label.font = .systemFont(ofSize: max(settings.fontSize - 1, 12), weight: .medium)
      stack.addArrangedSubview(spinner)
      stack.addArrangedSubview(label)
      centerView = stack
    } else if isTtsPlaying || isTtsPaused || ttsAudioData != nil {
      centerView = makeTtsAudioControls()
    } else {
      let pills = UIStackView()
      pills.translatesAutoresizingMaskIntoConstraints = false
      pills.axis = .horizontal
      pills.alignment = .center
      pills.spacing = 6
      let openPicker: () -> Void = { [weak self] in
        guard let self else { return }
        self.featureMode = .ttsLanguagePicker
        self.rebuildKeyboard()
      }
      pills.addArrangedSubview(
        makePillButton(
          title: resolvedTtsLanguage().name, background: settings.theme.key,
          foreground: settings.theme.label, minWidth: 72, action: openPicker))
      pills.addArrangedSubview(
        makePillButton(
          title: resolvedTtsVoice(), background: settings.theme.key,
          foreground: settings.theme.label, minWidth: 72, action: openPicker))
      centerView = pills
    }
    header.addSubview(centerView)

    let actionButton = makeRoundBaseButton(background: settings.theme.key, size: 32)
    if isTtsLoading {
      actionButton.setImage(sfSymbol("xmark", size: 12), for: .normal)
      actionButton.tintColor = settings.theme.label
      actionButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      actionButton.addAction(
        UIAction { [weak self] _ in
          self?.stopTts()
          self?.rebuildKeyboard()
        }, for: .touchUpInside)
    } else if isTtsPlaying || isTtsPaused || ttsAudioData != nil {
      actionButton.isHidden = true
    } else {
      actionButton.setImage(sfSymbol("play.fill", size: 12), for: .normal)
      actionButton.tintColor = settings.theme.label
      actionButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      actionButton.addAction(UIAction { [weak self] _ in self?.startTts() }, for: .touchUpInside)
    }
    header.addSubview(actionButton)
    applyHeaderConstraints(header: header, cancel: cancel, center: centerView, action: actionButton)
    return header
  }

  private func makeTtsAudioControls() -> UIView {
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 8
    stack.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: KeySurface.cardRadius,
      tint: KeySurface.glyphTint)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 3, left: 6, bottom: 3, right: 6)

    let playPause = makeRoundBaseButton(background: .clear, size: 26)
    playPause.setImage(sfSymbol(isTtsPlaying ? "pause.fill" : "play.fill", size: 11), for: .normal)
    playPause.tintColor = settings.theme.label
    playPause.contentEdgeInsets = UIEdgeInsets(top: 7, left: 7, bottom: 7, right: 7)
    playPause.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        if self.isTtsPlaying {
          self.pauseTtsPlayback()
          self.rebuildKeyboard()
        } else {
          self.resumeTtsPlayback()
        }
      }, for: .touchUpInside)

    let wave = WaveformView(barCount: 9, barMaxHeight: 16, color: settings.theme.accent)
    wave.usesAnimatedWaveform = useAnimatedWaveform
    wave.setAnimating(isTtsPlaying)
    wave.widthAnchor.constraint(equalToConstant: 94).isActive = true
    wave.heightAnchor.constraint(equalToConstant: 22).isActive = true

    let share = makeShareControlButton { [weak self] in self?.shareTtsAudio() }

    let clear = makeRoundBaseButton(background: .clear, size: 26)
    clear.setImage(
      UIImage(named: "ic_clear_text")?.withRenderingMode(.alwaysTemplate)
        ?? sfSymbol("xmark", size: 11), for: .normal)
    clear.tintColor = settings.theme.label
    clear.contentEdgeInsets = UIEdgeInsets(top: 7, left: 7, bottom: 7, right: 7)
    clear.addAction(
      UIAction { [weak self] _ in
        self?.stopTts()
        self?.rebuildKeyboard()
      }, for: .touchUpInside)

    stack.addArrangedSubview(playPause)
    stack.addArrangedSubview(wave)
    stack.addArrangedSubview(share)
    stack.addArrangedSubview(clear)
    return stack
  }

  private func makeTranslateHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear
    let cancel = makeCancelButton { [weak self] in
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let centerView: UIView
    if let err = toolbarErrors[.translate] {
      centerView = makeInlineErrorLabel(err, slot: .translate)
    } else {
      let stack = UIStackView()
      stack.translatesAutoresizingMaskIntoConstraints = false
      stack.axis = .horizontal
      stack.alignment = .center
      stack.spacing = 6
      stack.addArrangedSubview(
        makePillButton(
          title: sourceLanguageName, background: settings.theme.key,
          foreground: settings.theme.label
        ) { [weak self] in
          self?.featureMode = .languagePicker
          self?.rebuildKeyboard()
        })
      stack.addArrangedSubview(
        makeIconPillButton(
          imageName: "ic_swap_horizontal", background: settings.theme.key,
          foreground: settings.theme.label, minWidth: 30,
          enabled: canSwapTranslateLanguages()
        ) { [weak self] in
          guard let self, self.canSwapTranslateLanguages() else { return }
          self.swapTranslateLanguages()
        })
      stack.addArrangedSubview(
        makePillButton(
          title: targetLanguageName, background: settings.theme.key,
          foreground: settings.theme.label
        ) { [weak self] in
          self?.featureMode = .languagePicker
          self?.rebuildKeyboard()
        })
      centerView = stack
    }
    header.addSubview(centerView)

    let rightStack = UIStackView()
    rightStack.translatesAutoresizingMaskIntoConstraints = false
    rightStack.axis = .horizontal
    rightStack.alignment = .center
    rightStack.spacing = 6
    if canShowTranslationThinking {
      rightStack.addArrangedSubview(
        makeRoundIconButton(
          imageName: "ic_thinking_brain", background: settings.theme.key, tint: settings.theme.label
        ) { [weak self] in
          self?.openTranslationThinking()
        })
    }
    rightStack.addArrangedSubview(makeTranslateActionButton())
    header.addSubview(rightStack)

    NSLayoutConstraint.activate([
      cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: panelSideInset),
      cancel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      centerView.centerXAnchor.constraint(equalTo: header.centerXAnchor, constant: -16),
      centerView.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      centerView.leadingAnchor.constraint(greaterThanOrEqualTo: cancel.trailingAnchor, constant: 4),
      centerView.trailingAnchor.constraint(
        lessThanOrEqualTo: rightStack.leadingAnchor, constant: -4),
      rightStack.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -panelSideInset),
      rightStack.centerYAnchor.constraint(equalTo: header.centerYAnchor),
    ])
    return header
  }

  private func makeTranslateActionButton() -> UIButton {
    let btn = makeRoundBaseButton(background: settings.theme.key, size: 32)
    if isTranslating || isRestoringTranslation {
      embedSpinner(in: btn, color: settings.theme.label)
      btn.accessibilityLabel = isRestoringTranslation ? "Restoring translation" : "Translating"
    } else if lastTranslationState != nil {
      btn.setImage(sfSymbol("arrow.uturn.backward", size: 16), for: .normal)
      btn.accessibilityLabel = "Undo translation"
      btn.addAction(UIAction { [weak self] _ in self?.undoTranslation() }, for: .touchUpInside)
    } else {
      btn.setImage(iconImage(for: "mode-translate"), for: .normal)
      btn.imageView?.contentMode = .scaleAspectFit
      btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      btn.accessibilityLabel = "Translate"
      btn.addAction(UIAction { [weak self] _ in self?.triggerTranslate() }, for: .touchUpInside)
    }
    return btn
  }

  private func makeDictionaryHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear
    let cancel = makeCancelButton { [weak self] in
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let centerView: UIView
    if let err = toolbarErrors[.dictionary] {
      centerView = makeInlineErrorLabel(err, slot: .dictionary)
    } else {
      let stack = UIStackView()
      stack.translatesAutoresizingMaskIntoConstraints = false
      stack.axis = .horizontal
      stack.alignment = .center
      stack.spacing = 6
      let languageButton = makePillButton(
        title: dictionaryLanguageName, background: settings.theme.key,
        foreground: settings.theme.label
      ) { [weak self] in
        guard let self, !self.isDictionaryLoading else { return }
        self.featureMode = .dictionaryLanguagePicker
        self.rebuildKeyboard()
      }
      languageButton.isEnabled = !isDictionaryLoading
      languageButton.alpha = isDictionaryLoading ? 0.5 : 1
      stack.addArrangedSubview(languageButton)
      centerView = stack
    }
    header.addSubview(centerView)

    let rightStack = UIStackView()
    rightStack.translatesAutoresizingMaskIntoConstraints = false
    rightStack.axis = .horizontal
    rightStack.alignment = .center
    rightStack.spacing = 6
    rightStack.addArrangedSubview(makeDictionaryActionButton())
    header.addSubview(rightStack)

    NSLayoutConstraint.activate([
      cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: panelSideInset),
      cancel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      centerView.centerXAnchor.constraint(equalTo: header.centerXAnchor, constant: -16),
      centerView.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      centerView.leadingAnchor.constraint(greaterThanOrEqualTo: cancel.trailingAnchor, constant: 4),
      centerView.trailingAnchor.constraint(
        lessThanOrEqualTo: rightStack.leadingAnchor, constant: -4),
      rightStack.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -panelSideInset),
      rightStack.centerYAnchor.constraint(equalTo: header.centerYAnchor),
    ])
    return header
  }

  private func makeDictionaryActionButton() -> UIButton {
    let btn = makeRoundBaseButton(background: settings.theme.key, size: 32)
    if isDictionaryLoading {
      embedSpinner(in: btn, color: settings.theme.label)
      btn.accessibilityLabel = "Looking up"
    } else {
      btn.setImage(iconImage(for: "mode-dictionary"), for: .normal)
      btn.imageView?.contentMode = .scaleAspectFit
      btn.contentEdgeInsets = UIEdgeInsets(top: 7, left: 7, bottom: 7, right: 7)
    }
    btn.addAction(
      UIAction { [weak self] _ in self?.triggerDictionaryLookup() }, for: .touchUpInside)
    return btn
  }

  private func makeClipboardHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear

    let cancel = makeCancelButton { [weak self] in
      self?.clearToolbarError(.clipboard)
      self?.isClipboardEditMode = false
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let center: UILabel
    if let error = toolbarErrors[.clipboard] {
      center = makeInlineErrorLabel(error, slot: .clipboard)
    } else {
      let title = UILabel()
      title.translatesAutoresizingMaskIntoConstraints = false
      title.text = "Clipboard"
      title.textColor = settings.theme.label
      title.font = .systemFont(ofSize: max(settings.fontSize - 1, 11), weight: .medium)
      center = title
    }
    header.addSubview(center)

    let edit = makeRoundBaseButton(
      background: isClipboardEditMode ? settings.theme.accent : settings.theme.key, size: 32)
    edit.setImage(
      UIImage(systemName: "pencil", withConfiguration: symCfg(15)), for: .normal)
    edit.tintColor = settings.theme.label
    edit.accessibilityLabel = isClipboardEditMode ? "Done editing clips" : "Edit clips"
    edit.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.isClipboardEditMode.toggle()
        self.rebuildKeyboard()
      }, for: .touchUpInside)
    header.addSubview(edit)

    applyHeaderConstraints(header: header, cancel: cancel, center: center, action: edit)
    return header
  }

  private func makeClipboardPanel() -> UIView {
    ClipboardPanelView(
      clips: hasFullAccess ? KeyboardClipStore.shared.clips() : [],
      hasFullAccess: hasFullAccess,
      theme: settings.theme,
      fontSize: settings.fontSize,
      isEditing: isClipboardEditMode,
      onPaste: { [weak self] text in
        self?.playKeyFeedback()
        self?.pasteClip(text)
      },
      onTogglePin: { [weak self] clip in
        self?.playKeyFeedback()
        if KeyboardClipStore.shared.setPinned(clip.text, !clip.pinned) {
          self?.clearToolbarError(.clipboard)
          self?.rebuildKeyboard()
        } else {
          self?.showToolbarError(.clipboard, KeyboardErrorCatalog.pinLimitReached)
        }
      },
      onDelete: { [weak self] text in
        KeyboardClipStore.shared.delete(text)
        self?.rebuildKeyboard()
      })
  }

  private func makeTextEditingHeader() -> UIView {
    let header = UIView()
    header.backgroundColor = .clear

    let cancel = makeCancelButton { [weak self] in
      self?.finishTextEditingSelection()
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    header.addSubview(cancel)

    let title = UILabel()
    title.translatesAutoresizingMaskIntoConstraints = false
    title.text = "Text editing"
    title.textColor = settings.theme.label
    title.font = .systemFont(ofSize: max(settings.fontSize - 1, 11))
    header.addSubview(title)

    NSLayoutConstraint.activate([
      cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: panelSideInset),
      cancel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      title.leadingAnchor.constraint(equalTo: cancel.trailingAnchor, constant: 8),
      title.centerYAnchor.constraint(equalTo: header.centerYAnchor)
    ])
    return header
  }

  private func makeTextEditingPanel() -> UIView {
    let hasSelection = textDocumentProxy.selectedText != nil && !textDocumentProxy.selectedText!.isEmpty
    let hasText =
      !(textDocumentProxy.documentContextBeforeInput ?? "").isEmpty
      || !(textDocumentProxy.documentContextAfterInput ?? "").isEmpty
      || hasSelection
    let hasClipboard = hasFullAccess && UIPasteboard.general.hasStrings

    return TextEditingPanelView(
      theme: settings.theme,
      fontSize: settings.fontSize,
      hasText: hasText,
      hasSelection: hasSelection,
      hasClipboardContent: hasClipboard
    ) { [weak self] action in
      self?.handleTextEditingAction(action)
    }
  }

  private func handleTextEditingAction(_ action: TextEditingAction) {
    let proxy = textDocumentProxy
    switch action {
    case .select(let tapCount):
      resetTextEditingVerticalMovement()
      if isTextEditingSelectMode {
        finishTextEditingSelection(collapseSelectionAt: textEditingSelectionFocus)
        refreshTextEditingStateAfterHostMutation()
      } else {
        beginTextEditingSelection(granularity: granularity(for: tapCount))
      }
    case .moveLeft:
      resetTextEditingVerticalMovement()
      if collapseFullDocumentSelection(towardStart: true) {
        proxy.adjustTextPosition(byCharacterOffset: -1)
        refreshTextEditingStateAfterHostMutation()
      } else if isTextEditingSelectMode {
        moveTextEditingSelectionHorizontally(by: -1)
      } else {
        proxy.adjustTextPosition(byCharacterOffset: -1)
      }
    case .moveRight:
      resetTextEditingVerticalMovement()
      if collapseFullDocumentSelection(towardStart: false) {
        proxy.adjustTextPosition(byCharacterOffset: 1)
        refreshTextEditingStateAfterHostMutation()
      } else if isTextEditingSelectMode {
        moveTextEditingSelectionHorizontally(by: 1)
      } else {
        proxy.adjustTextPosition(byCharacterOffset: 1)
      }
    case .moveUp, .moveDown:
      let isUp = action == .moveUp
      if collapseFullDocumentSelection(towardStart: isUp) {
        DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
          self?.moveCaretVertically(isUp: isUp)
        }
      } else if isTextEditingSelectMode {
        moveTextEditingSelectionVertically(isUp: isUp)
      } else {
        moveCaretVertically(isUp: isUp)
      }
    case .jumpStart:
      resetTextEditingVerticalMovement()
      if isTextEditingSelectMode, let text = textEditingSelectionDocument {
        applyTextEditingSelection(in: text, focus: 0)
      } else {
        self.moveCursorToDocumentStart()
      }
    case .jumpEnd:
      resetTextEditingVerticalMovement()
      if isTextEditingSelectMode, let text = textEditingSelectionDocument {
        applyTextEditingSelection(in: text, focus: text.count)
      } else {
        self.moveCursorToDocumentEnd(hopsLeft: 50) { _ in }
      }
    case .backspace:
      resetTextEditingVerticalMovement()
      proxy.deleteBackward()
      finishTextEditingSelection()
      refreshTextEditingStateAfterHostMutation()
    case .selectAllOrCut:
      resetTextEditingVerticalMovement()
      if let text = proxy.selectedText, !text.isEmpty {
        guard hasFullAccess else { return }
        UIPasteboard.general.string = text
        discardTranslationUndo()
        proxy.deleteBackward()
        finishTextEditingSelection()
        refreshTextEditingStateAfterHostMutation()
      } else {
        beginTextEditingSelection(selectAll: true)
      }
    case .copy:
      if let text = proxy.selectedText {
        if hasFullAccess { UIPasteboard.general.string = text }
      }
    case .paste:
      resetTextEditingVerticalMovement()
      if hasFullAccess, let text = UIPasteboard.general.string {
        discardTranslationUndo()
        proxy.insertText(text)
        finishTextEditingSelection()
        appendToLocalTextCache(text)
        refreshTextEditingStateAfterHostMutation()
      }
    }
  }

  private func beginTextEditingSelection(
    selectAll: Bool = false, granularity: TextSelectionGranularity = .word
  ) {
    textEditingSelectionGeneration += 1
    let generation = textEditingSelectionGeneration
    let initiallySelectedText = textDocumentProxy.selectedText ?? ""
    isTextEditingSelectMode = true
    textEditingAnchor = -1
    textEditingSelectionFocus = -1
    textEditingSelectionDocument = nil
    updateTextEditingState()

    let readDocument = { [weak self] in
      guard let self else { return }
      self.readFullDocumentText(
        isCancelled: { [weak self] in
          guard let self else { return true }
          return generation != self.textEditingSelectionGeneration
            || !self.isTextEditingSelectMode
        },
        completion: { [weak self] text, caretOffset in
          guard let self else { return }
          guard generation == self.textEditingSelectionGeneration,
            self.isTextEditingSelectMode
          else { return }
          guard !text.isEmpty else {
            self.finishTextEditingSelection()
            self.updateTextEditingState()
            return
          }
          let existingSelectionStart = max(0, caretOffset - initiallySelectedText.count)
          let selection =
            if selectAll {
              (start: 0, end: text.count)
            } else if !initiallySelectedText.isEmpty {
              (start: existingSelectionStart, end: caretOffset)
            } else {
              switch granularity {
              case .word:
                self.wordSelectionRange(in: text, caretOffset: caretOffset)
                  ?? (start: caretOffset, end: caretOffset)
              case .line:
                self.lineSelectionRange(in: text, caretOffset: caretOffset)
                  ?? (start: caretOffset, end: caretOffset)
              case .sentence:
                self.sentenceSelectionRange(in: text, caretOffset: caretOffset)
                  ?? (start: caretOffset, end: caretOffset)
              }
            }
          self.installTextEditingSelection(
            document: text, anchor: selection.start, focus: selection.end,
            generation: generation)
        })
    }

    if initiallySelectedText.isEmpty {
      readDocument()
    } else {
      textDocumentProxy.insertText(initiallySelectedText)
      DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay, execute: readDocument)
    }
  }

  private func installTextEditingSelection(
    document: String, anchor: Int, focus: Int, generation: Int
  ) {
    discardTranslationUndo()
    deleteEntireDocument(
      isCancelled: { [weak self] in
        guard let self else { return true }
        return generation != self.textEditingSelectionGeneration
          || !self.isTextEditingSelectMode
      },
      completion: { [weak self] in
        guard let self else { return }
        self.isMutatingTranslationDocument = false
        guard generation == self.textEditingSelectionGeneration,
          self.isTextEditingSelectMode
        else {
          self.textDocumentProxy.insertText(document)
          return
        }
        self.textEditingSelectionDocument = document
        self.textEditingSelectionDocumentID = self.textDocumentProxy.documentIdentifier
        self.textEditingAnchor = min(max(anchor, 0), document.count)
        self.applyTextEditingSelection(in: document, focus: focus)
      })
  }

  private func applyTextEditingSelection(in document: String, focus: Int) {
    guard isTextEditingSelectMode, textEditingAnchor >= 0 else { return }
    let clampedFocus = min(max(focus, 0), document.count)
    let lower = min(textEditingAnchor, clampedFocus)
    let upper = max(textEditingAnchor, clampedFocus)
    let lowerUTF16 = utf16Offset(lower, in: document)
    let upperUTF16 = utf16Offset(upper, in: document)
    textEditingSelectionFocus = clampedFocus
    textDocumentProxy.setMarkedText(
      document,
      selectedRange: NSRange(location: lowerUTF16, length: upperUTF16 - lowerUTF16))
    refreshTextEditingStateAfterHostMutation()
  }

  private func moveTextEditingSelectionHorizontally(by delta: Int) {
    resetTextEditingVerticalMovement()
    guard let document = textEditingSelectionDocument, textEditingSelectionFocus >= 0 else {
      return
    }
    applyTextEditingSelection(in: document, focus: textEditingSelectionFocus + delta)
  }

  private func moveTextEditingSelectionVertically(isUp: Bool) {
    guard let document = textEditingSelectionDocument, textEditingSelectionFocus >= 0 else {
      return
    }
    let continuesVerticalMovement =
      textEditingLastVerticalCaretOffset == textEditingSelectionFocus
      && textEditingLastVerticalDocument == document
    guard
      let target = logicalLineCaretTarget(
        in: document, caretOffset: textEditingSelectionFocus, isUp: isUp,
        preferredColumn: continuesVerticalMovement ? textEditingPreferredVerticalColumn : nil)
    else { return }
    textEditingPreferredVerticalColumn = target.preferredColumn
    textEditingLastVerticalCaretOffset = target.offset
    textEditingLastVerticalDocument = document
    applyTextEditingSelection(in: document, focus: target.offset)
  }

  private func collapseFullDocumentSelection(towardStart: Bool) -> Bool {
    guard isTextEditingSelectMode, let document = textEditingSelectionDocument else {
      return false
    }
    let lower = min(textEditingAnchor, textEditingSelectionFocus)
    let upper = max(textEditingAnchor, textEditingSelectionFocus)
    guard lower == 0, upper == document.count else { return false }
    finishTextEditingSelection(collapseSelectionAt: towardStart ? 0 : document.count)
    return true
  }

  private func finishTextEditingSelection(collapseSelectionAt caretOffset: Int? = nil) {
    resetTextEditingVerticalMovement()
    textEditingSelectionGeneration += 1
    let document = textEditingSelectionDocument
    isTextEditingSelectMode = false
    textEditingAnchor = -1
    textEditingSelectionFocus = -1
    textEditingSelectionDocument = nil
    textEditingSelectionDocumentID = nil
    if let document, let caretOffset, caretOffset >= 0 {
      let caretUTF16 = utf16Offset(min(caretOffset, document.count), in: document)
      textDocumentProxy.setMarkedText(
        document, selectedRange: NSRange(location: caretUTF16, length: 0))
      textDocumentProxy.unmarkText()
    } else if document != nil {
      textDocumentProxy.unmarkText()
    }
  }

  private func wordSelectionRange(
    in text: String, caretOffset: Int
  ) -> (start: Int, end: Int)? {
    guard !text.isEmpty else { return nil }
    let caret = min(max(caretOffset, 0), text.count)
    var words: [(start: Int, end: Int)] = []
    text.enumerateSubstrings(
      in: text.startIndex..<text.endIndex,
      options: [.byWords, .substringNotRequired]
    ) { _, range, _, _ in
      words.append(
        (
          start: text.distance(from: text.startIndex, to: range.lowerBound),
          end: text.distance(from: text.startIndex, to: range.upperBound)
        ))
    }
    if let containing = words.first(where: { $0.start <= caret && caret < $0.end }) {
      return containing
    }
    if let preceding = words.last(where: { $0.end == caret }) { return preceding }
    if let next = words.first(where: { $0.start >= caret }) { return next }
    return words.last
  }

  private func lineSelectionRanges(in text: String) -> [(start: Int, end: Int)] {
    guard !text.isEmpty else { return [] }
    var starts = [0]
    var offset = 0
    for character in text {
      offset += 1
      if character.isNewline { starts.append(offset) }
    }
    return starts.enumerated().map { index, start in
      let end = index + 1 < starts.count ? starts[index + 1] - 1 : text.count
      return (start: start, end: max(start, end))
    }
  }

  private func lineSelectionRange(
    in text: String, caretOffset: Int
  ) -> (start: Int, end: Int)? {
    let lines = lineSelectionRanges(in: text)
    guard !lines.isEmpty else { return nil }
    let caret = min(max(caretOffset, 0), text.count)
    return lines.last(where: { $0.start <= caret }) ?? lines[0]
  }

  private func sentenceSelectionRange(
    in text: String, caretOffset: Int
  ) -> (start: Int, end: Int)? {
    guard !text.isEmpty else { return nil }
    let caret = min(max(caretOffset, 0), text.count)
    var sentences: [(start: Int, end: Int)] = []
    text.enumerateSubstrings(
      in: text.startIndex..<text.endIndex,
      options: [.bySentences, .substringNotRequired]
    ) { _, range, _, _ in
      sentences.append(
        (
          start: text.distance(from: text.startIndex, to: range.lowerBound),
          end: text.distance(from: text.startIndex, to: range.upperBound)
        ))
    }
    if let containing = sentences.first(where: { $0.start <= caret && caret < $0.end }) {
      return containing
    }
    if let preceding = sentences.last(where: { $0.end == caret }) { return preceding }
    if let next = sentences.first(where: { $0.start >= caret }) { return next }
    return sentences.last
  }

  private func finishTextEditingSelectionIfHostDiverged() {
    guard isTextEditingSelectMode, let document = textEditingSelectionDocument,
      textEditingAnchor >= 0, textEditingSelectionFocus >= 0
    else { return }
    guard textEditingSelectionDocumentID == textDocumentProxy.documentIdentifier else {
      finishTextEditingSelection()
      return
    }
    let lower = min(textEditingAnchor, textEditingSelectionFocus)
    let upper = max(textEditingAnchor, textEditingSelectionFocus)
    let start = document.index(document.startIndex, offsetBy: lower)
    let end = document.index(document.startIndex, offsetBy: upper)
    let expectedSelection = String(document[start..<end])
    if (textDocumentProxy.selectedText ?? "") != expectedSelection {
      finishTextEditingSelection()
    }
  }

  private func moveCursorToDocumentStart() {
    let proxy = textDocumentProxy
    var offset = 0
    let step = 100
    for _ in 0..<50 {
      let before = proxy.documentContextBeforeInput ?? ""
      if before.isEmpty { break }
      proxy.adjustTextPosition(byCharacterOffset: -min(before.count, step))
      offset -= min(before.count, step)
    }
  }

  private func moveCaretVertically(isUp: Bool) {
    guard textDocumentProxy.selectedText?.isEmpty != false else { return }
    readFullDocumentText { [weak self] text, caretOffset in
      guard let self else { return }
      let continuesVerticalMovement =
        self.textEditingLastVerticalCaretOffset == caretOffset
        && self.textEditingLastVerticalDocument == text
      guard let target = self.logicalLineCaretTarget(
        in: text, caretOffset: caretOffset, isUp: isUp,
        preferredColumn: continuesVerticalMovement
          ? self.textEditingPreferredVerticalColumn : nil)
      else { return }
      self.textEditingPreferredVerticalColumn = target.preferredColumn
      self.textEditingLastVerticalCaretOffset = target.offset
      self.textEditingLastVerticalDocument = text
      let delta = target.offset - caretOffset
      if delta != 0 {
        self.textDocumentProxy.adjustTextPosition(byCharacterOffset: delta)
        self.updateTextEditingState()
      }
    }
  }

  private func logicalLineCaretTarget(
    in text: String, caretOffset: Int, isUp: Bool, preferredColumn: Int?
  ) -> (offset: Int, preferredColumn: Int)? {
    let lines = lineSelectionRanges(in: text)
    guard !lines.isEmpty else { return nil }
    let caret = min(max(caretOffset, 0), text.count)
    let currentIndex = lines.lastIndex(where: { $0.start <= caret }) ?? 0
    let targetIndex = currentIndex + (isUp ? -1 : 1)
    guard lines.indices.contains(targetIndex) else { return nil }

    let current = lines[currentIndex]
    let target = lines[targetIndex]
    let currentColumn = min(max(caret - current.start, 0), current.end - current.start)
    let desiredColumn = preferredColumn ?? currentColumn
    return (
      offset: target.start + min(desiredColumn, target.end - target.start),
      preferredColumn: desiredColumn
    )
  }

  private func resetTextEditingVerticalMovement() {
    textEditingPreferredVerticalColumn = nil
    textEditingLastVerticalCaretOffset = nil
    textEditingLastVerticalDocument = nil
  }

  private func utf16Offset(_ characterOffset: Int, in text: String) -> Int {
    let index = text.index(text.startIndex, offsetBy: min(max(characterOffset, 0), text.count))
    return text.utf16.distance(from: text.utf16.startIndex, to: index.samePosition(in: text.utf16)!)
  }

  private func makeToolsPanel() -> UIView {
    ToolsPanelView(
      theme: settings.theme,
      fontSize: settings.fontSize,
      order: toolOrder,
      longPressDuration: 0.35,
      image: { [weak self] tool in self?.iconImage(for: tool.iconKey) },
      isActive: { [weak self] tool in self?.isToolActive(tool) ?? false },
      onActivate: { [weak self] tool in
        self?.playKeyFeedback()
        self?.activateTool(tool)
      },
      onOrderChanged: { [weak self] order in
        self?.toolOrder = order
        self?.refreshModeBarInPlace()
      },
      onOrderCommitted: { [weak self] order in
        self?.toolOrder = order
        KeyboardToolOrder.persist(order)
      })
  }

  private func isToolActive(_ tool: KeyboardTool) -> Bool {
    switch tool {
    case .translate: return featureMode == .translate
    case .voice: return isSttListening || isSttStarting || isSttProcessing
    case .speak: return isTtsPlaying || isTtsLoading || ttsAudioData != nil
    case .dictionary: return featureMode == .dictionary
    case .clipboard: return featureMode == .clipboard
    case .textEditing: return featureMode == .textEditing
    case .languages: return featureMode == .keyboardLanguagePicker
    case .emoji: return featureMode == .emoji
    case .settings: return false
    }
  }

  private func makeLoginRequiredCard() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear

    let backRow = makePanelHeader(title: "Login Required") { [weak self] in
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let card = UIStackView()
    card.translatesAutoresizingMaskIntoConstraints = false
    card.axis = .vertical
    card.alignment = .fill
    card.spacing = 10
    card.isLayoutMarginsRelativeArrangement = true
    card.layoutMargins = UIEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
    card.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: KeySurface.cardRadius,
      tint: KeySurface.glyphTint)
    panel.addSubview(card)

    let title = UILabel()
    title.text = "Sign in to continue"
    title.textColor = settings.theme.label
    title.font = .systemFont(ofSize: max(settings.fontSize + 1, 15), weight: .semibold)
    title.textAlignment = .center
    card.addArrangedSubview(title)

    let message = UILabel()
    message.text = "Open Hypa Intelligence to sign in, then return to the keyboard."
    message.textColor = settings.theme.label.withAlphaComponent(0.72)
    message.font = .systemFont(ofSize: max(settings.fontSize - 2, 11))
    message.textAlignment = .center
    message.numberOfLines = 0
    card.addArrangedSubview(message)

    let signInButton = UIButton(type: .system)
    signInButton.translatesAutoresizingMaskIntoConstraints = false
    signInButton.applyKeyAesthetics(
      background: settings.theme.accent, cornerRadius: KeySurface.controlRadius,
      tint: KeySurface.glyphTint, pressedColor: settings.theme.keyPressed)
    signInButton.setTitle("Open App to Sign In", for: .normal)
    signInButton.setTitleColor(.white, for: .normal)
    signInButton.titleLabel?.font = .systemFont(
      ofSize: max(settings.fontSize - 1, 12), weight: .semibold)
    signInButton.heightAnchor.constraint(equalToConstant: 42).isActive = true
    signInButton.addAction(
      UIAction { [weak self] _ in
        self?.openHostAppForLogin()
      }, for: .touchUpInside)
    card.addArrangedSubview(signInButton)

    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      card.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      card.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      card.centerYAnchor.constraint(equalTo: panel.centerYAnchor, constant: 12),
    ])
    return panel
  }

  private func openHostAppForLogin() {
    let candidates = [
      "hypaintelligence:///(entry)",
      "hypaintelligence://",
      "hypa-intelligence://login",
      "hypa://login",
    ].compactMap(URL.init(string:))

    openFirstAvailableHostURL(candidates[...]) { [weak self] in
      guard let self else { return }
      self.featureMode = .keyboard
      self.showToolbarError(.modeBar, KeyboardErrorCatalog.signInRequired)
    }
  }

  private func openHostAppForSettings() {
    let candidates = [
      "hypaintelligence://settings",
      "hypaintelligence:///settings",
    ].compactMap(URL.init(string:))

    openFirstAvailableHostURL(candidates[...])
  }

  private func openFirstAvailableHostURL(
    _ urls: ArraySlice<URL>, onFailure: (() -> Void)? = nil
  ) {
    guard let url = urls.first else {
      onFailure?()
      return
    }

    extensionContext?.open(url) { [weak self] opened in
      guard !opened else { return }
      DispatchQueue.main.async {
        self?.openFirstAvailableHostURL(urls.dropFirst(), onFailure: onFailure)
      }
    }
  }

  private func makeSearchCircleIconButton(
    image: UIImage?, background: UIColor, tint: UIColor, size: CGFloat = 32,
    action: @escaping () -> Void
  ) -> UIButton {
    let btn = makeRoundBaseButton(background: background, size: size)
    btn.tintColor = tint
    btn.setImage(image, for: .normal)
    btn.imageView?.contentMode = .scaleAspectFit
    let inset = size * 0.28
    btn.contentEdgeInsets = UIEdgeInsets(top: inset, left: inset, bottom: inset, right: inset)
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func makeBlinkingCaret() -> UIView {
    let caret = UIView()
    caret.translatesAutoresizingMaskIntoConstraints = false
    caret.backgroundColor = settings.theme.label
    caret.layer.cornerRadius = 1
    caret.widthAnchor.constraint(equalToConstant: 2).isActive = true
    caret.heightAnchor.constraint(equalToConstant: 18).isActive = true
    let anim = CABasicAnimation(keyPath: "opacity")
    anim.fromValue = 1
    anim.toValue = 0
    anim.duration = 0.55
    anim.autoreverses = true
    anim.repeatCount = .infinity
    anim.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    caret.layer.add(anim, forKey: "caretBlink")
    return caret
  }

  private func makePickerSearchView() -> UIView {
    let container = UIView()

    let back = makeSearchCircleIconButton(
      image: sfSymbol("chevron.left", size: 15, weight: .semibold),
      background: settings.theme.toolbar, tint: settings.theme.label, size: 32
    ) { [weak self] in
      self?.closePickerSearch()
    }
    back.accessibilityLabel = "Back to picker"
    container.addSubview(back)

    let field = UIView()
    field.translatesAutoresizingMaskIntoConstraints = false
    field.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: 17, tint: KeySurface.glyphTint)
    container.addSubview(field)

    let fieldStack = UIStackView()
    fieldStack.translatesAutoresizingMaskIntoConstraints = false
    fieldStack.axis = .horizontal
    fieldStack.alignment = .center
    fieldStack.spacing = 6
    field.addSubview(fieldStack)

    let searchIcon = UIImageView(image: sfSymbol("magnifyingglass", size: 14, weight: .medium))
    searchIcon.tintColor = UIColor(hex: "#A1A1AA")
    searchIcon.contentMode = .scaleAspectFit
    searchIcon.setContentHuggingPriority(.required, for: .horizontal)
    fieldStack.addArrangedSubview(searchIcon)

    let placeholderText: String
    if pickerSearchQuery.isEmpty {
      switch pickerSearchScope {
      case .translateSource: placeholderText = "Search source language"
      case .translateTarget: placeholderText = "Search target language"
      case .ttsVoice: placeholderText = "Search voice"
      case .emoji: placeholderText = "Search emoji"
      default: placeholderText = "Search language"
      }
    } else {
      placeholderText = pickerSearchQuery
    }

    let textContainer = UIView()
    textContainer.translatesAutoresizingMaskIntoConstraints = false

    let textLabel = UILabel()
    textLabel.translatesAutoresizingMaskIntoConstraints = false
    textLabel.text = placeholderText
    textLabel.textColor = pickerSearchQuery.isEmpty ? UIColor(hex: "#A1A1AA") : settings.theme.label
    textLabel.font = .systemFont(ofSize: max(settings.fontSize - 1, 12))
    textLabel.lineBreakMode = pickerSearchQuery.isEmpty ? .byTruncatingTail : .byTruncatingHead
    textLabel.setContentHuggingPriority(.defaultHigh, for: .horizontal)
    textLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    textContainer.addSubview(textLabel)
    textContainer.setContentHuggingPriority(.defaultHigh, for: .horizontal)
    textContainer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

    let caret = makeBlinkingCaret()
    caret.translatesAutoresizingMaskIntoConstraints = false
    caret.setContentHuggingPriority(.required, for: .horizontal)
    caret.setContentCompressionResistancePriority(.required, for: .horizontal)
    textContainer.addSubview(caret)

    NSLayoutConstraint.activate([
      textLabel.centerYAnchor.constraint(equalTo: textContainer.centerYAnchor),
      textLabel.topAnchor.constraint(equalTo: textContainer.topAnchor),
      textLabel.bottomAnchor.constraint(equalTo: textContainer.bottomAnchor),
      caret.centerYAnchor.constraint(equalTo: textContainer.centerYAnchor),
    ])

    if pickerSearchQuery.isEmpty {
      caret.leadingAnchor.constraint(equalTo: textContainer.leadingAnchor).isActive = true
      textLabel.leadingAnchor.constraint(equalTo: caret.trailingAnchor, constant: 6).isActive = true
      textLabel.trailingAnchor.constraint(equalTo: textContainer.trailingAnchor).isActive = true
    } else {
      textLabel.leadingAnchor.constraint(equalTo: textContainer.leadingAnchor).isActive = true
      caret.leadingAnchor.constraint(equalTo: textLabel.trailingAnchor, constant: 1).isActive = true
      caret.trailingAnchor.constraint(equalTo: textContainer.trailingAnchor).isActive = true
    }

    fieldStack.addArrangedSubview(textContainer)

    let trailingSpacer = UIView()
    trailingSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
    fieldStack.addArrangedSubview(trailingSpacer)

    let scroll = UIScrollView()
    scroll.showsHorizontalScrollIndicator = false
    let stack = UIStackView()
    stack.axis = .horizontal
    stack.spacing = 6
    stack.alignment = .center
    scroll.addSubview(stack)
    let query = pickerSearchQuery
    let emojiSearch = pickerSearchScope == .emoji
    let options: [(String, String)]
    if emojiSearch {
      options = query.isEmpty
        ? recentEmojiStore.recent().prefix(40).map { ($0, $0) }
        : emojiRepository.search(query: query, recentStore: recentEmojiStore, limit: 40)
          .map { ($0.name, $0.sequence) }
    } else {
      options = Array(pickerSearchOptions().filter {
        query.isEmpty || $0.0.range(of: query, options: .caseInsensitive) != nil
      }.prefix(query.isEmpty ? 5 : Int.max))
    }

    if options.isEmpty {
      let noRes = UILabel()
      noRes.translatesAutoresizingMaskIntoConstraints = false
      noRes.text = emojiSearch && query.isEmpty ? "No recently used emoji" : "Not found"
      noRes.textColor = .secondaryLabel
      noRes.font = .systemFont(ofSize: panelCaptionFontSize)
      stack.addArrangedSubview(noRes)
    } else {
      for (name, value) in options {
        let pill = UIButton(type: .system)
        pill.setTitle(emojiSearch ? value : name, for: .normal)
        pill.setTitleColor(settings.theme.label, for: .normal)
        pill.titleLabel?.font = .systemFont(ofSize: emojiSearch ? 22 : panelOptionFontSize)
        pill.backgroundColor = emojiSearch ? .clear : settings.theme.toolbar
        pill.layer.cornerRadius = 14
        pill.contentEdgeInsets = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)
        pill.heightAnchor.constraint(equalToConstant: 28).isActive = true
        pill.accessibilityLabel = "Select \(name)"
        pill.addAction(
          UIAction { [weak self] _ in self?.selectPickerSearchOption(value) }, for: .touchUpInside)
        stack.addArrangedSubview(pill)
      }
    }
    container.addSubview(scroll)
    scroll.translatesAutoresizingMaskIntoConstraints = false
    stack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      back.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 4),
      back.centerYAnchor.constraint(equalTo: container.centerYAnchor),
      back.widthAnchor.constraint(equalToConstant: 32),
      back.heightAnchor.constraint(equalToConstant: 32),
      field.leadingAnchor.constraint(equalTo: back.trailingAnchor, constant: 8),
      field.widthAnchor.constraint(equalToConstant: 140),
      field.centerYAnchor.constraint(equalTo: back.centerYAnchor),
      field.heightAnchor.constraint(equalToConstant: 34),
      fieldStack.leadingAnchor.constraint(equalTo: field.leadingAnchor, constant: 12),
      fieldStack.trailingAnchor.constraint(equalTo: field.trailingAnchor, constant: -12),
      fieldStack.topAnchor.constraint(equalTo: field.topAnchor),
      fieldStack.bottomAnchor.constraint(equalTo: field.bottomAnchor),
      scroll.leadingAnchor.constraint(equalTo: field.trailingAnchor, constant: 8),
      scroll.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -4),
      scroll.centerYAnchor.constraint(equalTo: back.centerYAnchor),
      scroll.heightAnchor.constraint(equalToConstant: 30),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
    ])
    return container
  }

  private func makePickerSearchButton(_ scope: PickerSearchScope) -> UIButton {
    let button = makeSearchCircleIconButton(
      image: sfSymbol("magnifyingglass", size: 13, weight: .medium),
      background: settings.theme.toolbar, tint: settings.theme.label, size: 30
    ) { [weak self] in
      self?.beginPickerSearch(scope, returnMode: self?.featureMode ?? .keyboard)
    }
    button.accessibilityLabel = "Search"
    return button
  }

  private func makePickerSectionHeader(_ title: String, scope: PickerSearchScope) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .center
    let label = UILabel()
    label.text = title
    label.textColor = .label
    label.font = .systemFont(ofSize: panelCaptionFontSize)
    row.addArrangedSubview(label)
    row.addArrangedSubview(UIView())
    row.addArrangedSubview(makePickerSearchButton(scope))
    return row
  }

  private func makeLanguagePickerView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Change Language") { [weak self] in
      self?.featureMode = .translate
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let columns = UIStackView()
    columns.translatesAutoresizingMaskIntoConstraints = false
    columns.axis = .horizontal
    columns.alignment = .fill
    columns.distribution = .fill
    columns.spacing = 8
    panel.addSubview(columns)

    let srcCol = makeLanguageColumn(isSource: true)
    let tgtCol = makeLanguageColumn(isSource: false)
    columns.addArrangedSubview(srcCol)

    let swapCol = UIView()
    swapCol.translatesAutoresizingMaskIntoConstraints = false
    swapCol.widthAnchor.constraint(equalToConstant: 48).isActive = true
    let swapBtn = makeIconPillButton(
      imageName: "ic_swap_horizontal", background: settings.theme.toolbar,
      foreground: settings.theme.label, minWidth: 36,
      enabled: canSwapTranslateLanguages()
    ) { [weak self] in
      guard let self, self.canSwapTranslateLanguages() else { return }
      self.swapTranslateLanguages(rebuildUI: false)
      self.featureMode = .languagePicker
      self.refreshOpenPickerSelections()
    }
    swapBtn.accessibilityIdentifier = "picker:translate-swap"
    swapCol.addSubview(swapBtn)
    NSLayoutConstraint.activate([
      swapBtn.topAnchor.constraint(equalTo: swapCol.topAnchor, constant: 24),
      swapBtn.centerXAnchor.constraint(equalTo: swapCol.centerXAnchor),
      swapBtn.widthAnchor.constraint(equalToConstant: 36),
      swapBtn.heightAnchor.constraint(equalToConstant: 36),
    ])
    columns.addArrangedSubview(swapCol)
    columns.addArrangedSubview(tgtCol)
    srcCol.widthAnchor.constraint(equalTo: tgtCol.widthAnchor).isActive = true

    let done = makeDoneButton { [weak self] in
      self?.featureMode = .translate
      self?.rebuildKeyboard()
    }
    panel.addSubview(done)
    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      columns.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      columns.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      columns.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      columns.bottomAnchor.constraint(equalTo: done.topAnchor, constant: -8),
      done.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      done.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      done.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      done.heightAnchor.constraint(equalToConstant: 38),
    ])
    return panel
  }

  private func makeLanguageColumn(isSource: Bool) -> UIView {
    let container = UIStackView()
    container.axis = .vertical
    container.alignment = .fill
    container.spacing = 4

    let header = makePickerSectionHeader(
      isSource ? "Source" : "Target",
      scope: isSource ? .translateSource : .translateTarget)
    container.addArrangedSubview(header)

    let scroll = makePickerScrollView(
      offsetKey: isSource ? "translate-source" : "translate-target")
    scroll.setContentHuggingPriority(.defaultLow, for: .horizontal)
    scroll.setContentHuggingPriority(.defaultLow, for: .vertical)
    container.addArrangedSubview(scroll)

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 5
    scroll.addSubview(stack)

    let options = isSource ? supportedSourceLanguages : supportedTargetLanguages
    options.forEach {
      stack.addArrangedSubview(makeLanguageOption($0, isSource: isSource))
    }
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 2),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -2),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -4),
    ])
    return container
  }

  private func makePickerScrollView(offsetKey: String? = nil) -> KeyboardPickerScrollView {
    let scroll = KeyboardPickerScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.scrollOffsetKey = offsetKey
    scroll.showsVerticalScrollIndicator = true
    scroll.alwaysBounceVertical = true
    scroll.delaysContentTouches = false
    scroll.canCancelContentTouches = true
    if offsetKey != nil {
      schedulePickerScrollRestore(for: scroll)
    }
    return scroll
  }

  private func makeLanguageOption(_ lang: TranslationLanguage, isSource: Bool) -> UIButton {
    let selected = isSource ? sourceLanguageCode : targetLanguageCode
    let isSelected = lang.code.caseInsensitiveCompare(selected) == .orderedSame
    let btn = KeyboardSelectionButton(
      title: lang.name,
      isSelected: isSelected,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier =
      "picker:translate-\(isSource ? "source" : "target"):\(lang.code)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        let previousTargetCode = self.targetLanguageCode
        if isSource {
          self.sourceLanguageCode = lang.code
          self.sourceLanguageName = lang.name
        } else {
          self.targetLanguageCode = lang.code
          self.targetLanguageName = lang.name
        }
        self.saveSharedLanguageSettings(
          translateSourceLanguage: self.sourceLanguageName,
          translateTargetLanguage: self.targetLanguageName
        )
        let skipAutoRetranslate = self.lastTranslationState?.isSelectionScoped == true
        let retranslateSource =
          self.lastTranslationState != nil && !skipAutoRetranslate
          ? self.lastSentTranslationSourceText : nil
        self.discardTranslationUndo(refreshUI: false)
        self.featureMode = .languagePicker
        self.refreshOpenPickerSelections()

        let languageChanged = !isSource && lang.code.caseInsensitiveCompare(previousTargetCode) != .orderedSame
        if languageChanged && self.settings.autoTranslateOnLanguageChange && !skipAutoRetranslate {
          let context = self.limitedTextContext()
          let hasText = !(context.before + context.selected + context.after)
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          if hasText || !(retranslateSource?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
          {
            self.featureMode = .translate
            self.rebuildKeyboard()
            self.triggerTranslate(preferredSource: retranslateSource)
          }
        }
      }, for: .touchUpInside)
    return btn
  }

  private func makeSttLanguagePickerView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Speech Language") { [weak self] in
      self?.featureMode = .stt
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let header = makePickerSectionHeader("Language", scope: .sttLanguage)
    header.translatesAutoresizingMaskIntoConstraints = false
    panel.addSubview(header)

    let scroll = makePickerScrollView(offsetKey: "stt-language")
    panel.addSubview(scroll)

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 6
    scroll.addSubview(stack)

    supportedSttLanguages.forEach { stack.addArrangedSubview(makeSttLanguageOptionButton($0)) }

    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      header.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      header.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 4),
      scroll.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      scroll.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
    ])
    return panel
  }

  private func makeSttLanguageOptionButton(_ language: TranslationLanguage) -> UIButton {
    let isSelected = language.code.caseInsensitiveCompare(selectedSttLanguageCode) == .orderedSame
    let btn = KeyboardSelectionButton(
      title: language.name,
      isSelected: isSelected,
      showsCheckmark: true,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:stt-language:\(language.code)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.selectedSttLanguageCode = language.code
        self.selectedSttLanguageName = language.name
        self.featureMode = .stt
        self.rebuildKeyboard()
      }, for: .touchUpInside)
    return btn
  }

  private func makeTtsLanguageVoicePickerView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Voice & Language") { [weak self] in
      self?.featureMode = .tts
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let columns = UIStackView()
    columns.translatesAutoresizingMaskIntoConstraints = false
    columns.axis = .horizontal
    columns.alignment = .fill
    columns.spacing = 12
    panel.addSubview(columns)

    let languageCol = makeTtsPickerColumn(
      title: "Language",
      offsetKey: "tts-language",
      options: supportedTtsLanguages.map { makeTtsLanguageOptionButton($0) })
    let voiceCol = makeTtsPickerColumn(
      title: "Voice",
      offsetKey: "tts-voice",
      options: voicesForTtsLanguage().map { makeTtsVoiceOptionButton($0) })
    columns.addArrangedSubview(languageCol)
    columns.addArrangedSubview(voiceCol)
    languageCol.widthAnchor.constraint(equalTo: voiceCol.widthAnchor).isActive = true

    let done = makeDoneButton { [weak self] in
      self?.featureMode = .tts
      self?.rebuildKeyboard()
    }
    panel.addSubview(done)
    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      columns.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      columns.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      columns.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      columns.bottomAnchor.constraint(equalTo: done.topAnchor, constant: -8),
      done.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      done.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      done.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      done.heightAnchor.constraint(equalToConstant: 38),
    ])
    return panel
  }

  private func makeTtsPickerColumn(title: String, offsetKey: String, options: [UIView])
    -> UIView
  {
    let container = UIStackView()
    container.axis = .vertical
    container.alignment = .fill
    container.spacing = 4

    let header = makePickerSectionHeader(
      title, scope: title == "Language" ? .ttsLanguage : .ttsVoice)
    container.addArrangedSubview(header)

    let scroll = makePickerScrollView(offsetKey: offsetKey)
    scroll.setContentHuggingPriority(.defaultLow, for: .horizontal)
    scroll.setContentHuggingPriority(.defaultLow, for: .vertical)
    container.addArrangedSubview(scroll)

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 5
    scroll.addSubview(stack)

    options.forEach { stack.addArrangedSubview($0) }
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 2),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -2),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -4),
    ])
    return container
  }

  private func makeTtsLanguageOptionButton(_ language: TranslationLanguage) -> UIButton {
    let isSelected =
      language.code.caseInsensitiveCompare(resolvedTtsLanguage().code) == .orderedSame
    let btn = KeyboardSelectionButton(
      title: language.name,
      isSelected: isSelected,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:tts-language:\(language.code)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.setTtsLanguage(language)
        self.rebuildKeyboard(resetPickerScrollKeys: ["tts-voice"])
      }, for: .touchUpInside)
    return btn
  }

  private func makeTtsVoiceOptionButton(_ voice: String) -> UIButton {
    let isSelected = voice.caseInsensitiveCompare(resolvedTtsVoice()) == .orderedSame
    let btn = KeyboardSelectionButton(
      title: voice,
      isSelected: isSelected,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:tts-voice:\(voice)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.saveSelectedVoice(voice)
        self.refreshOpenPickerSelections()
      }, for: .touchUpInside)
    return btn
  }

  private func setTtsLanguage(_ language: TranslationLanguage) {
    selectedTtsLanguageCode = language.code
    saveSharedLanguageSettings(ttsLanguage: language.code)
    voicesForTtsLanguage().first.map { saveSelectedVoice($0) }
  }

  private func voicesForTtsLanguage() -> [String] {
    KeyboardLanguageCatalog.ttsVoices(
      languageCode: resolvedTtsLanguage().code, model: resolvedTtsServiceModel().model)
  }

  private func resolvedTtsServiceModel() -> KeyboardLanguageCatalog.ServiceModelSelection {
    KeyboardLanguageCatalog.resolveTts(
      selectedProvider: settings.ttsProvider, selectedModel: settings.ttsModel)
  }

  private func resolvedTtsLanguage() -> TranslationLanguage {
    if let language = supportedTtsLanguages.first(where: {
      $0.code.caseInsensitiveCompare(selectedTtsLanguageCode) == .orderedSame
    }) {
      return language
    }
    return
      supportedTtsLanguages.first(where: {
        $0.code == KeyboardLanguageCatalog.defaultSourceLanguage.code
      })
      ?? supportedTtsLanguages.first
      ?? KeyboardLanguageCatalog.defaultSourceLanguage
  }

  private func resolvedTtsVoice(forLanguage language: String? = nil) -> String {
    let languageCode: String
    if let language {
      languageCode =
        KeyboardLanguageCatalog.language(name: language)?.code ?? canonicalLanguageCode(language)
    } else {
      languageCode = resolvedTtsLanguage().code
    }
    let voices = KeyboardLanguageCatalog.ttsVoices(
      languageCode: languageCode, model: resolvedTtsServiceModel().model)
    if let canonical = voices.first(where: {
      $0.caseInsensitiveCompare(selectedVoice) == .orderedSame
    }) {
      return canonical
    }
    return voices.first ?? ""
  }

  private func normalizeSelectedVoiceForTtsLanguage(persist: Bool) {
    let resolved = resolvedTtsVoice()
    guard !resolved.isEmpty, selectedVoice.caseInsensitiveCompare(resolved) != .orderedSame else {
      return
    }
    if persist {
      saveSelectedVoice(resolved)
    } else {
      selectedVoice = resolved
    }
  }

  private func makeThinkingView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Translation Thinking") { [weak self] in
      self?.featureMode = .translate
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)
    let scroll = makePickerScrollView()
    panel.addSubview(scroll)
    let bodyCard = UIView()
    bodyCard.translatesAutoresizingMaskIntoConstraints = false
    bodyCard.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: KeySurface.cardRadius,
      tint: KeySurface.glyphTint)
    let body = PaddingLabel()
    body.translatesAutoresizingMaskIntoConstraints = false
    body.contentInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 54)
    body.textColor = settings.theme.label
    body.font = .systemFont(ofSize: max(settings.fontSize - 1, 11))
    body.numberOfLines = 0
    if isTranslationThinkingLoading {
      body.text = "Generating translation breakdown…"
    } else if latestTranslationThinking?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      == false
    {
      body.text = latestTranslationThinking
    } else {
      body.text = "No thinking trace was returned for the last translation."
    }
    bodyCard.addSubview(body)
    let listen = makeDictionaryListenButton(
      identifier: "translation-thinking",
      action: { [weak self] in
        guard let self, let thinking = self.latestTranslationThinking else { return }
        self.startDictionaryTts(
          text: thinking,
          language: self.targetLanguageName, identifier: "translation-thinking")
      },
      background: settings.theme.accent,
      tint: settings.theme.label,
      size: 32,
      pointSize: 15)
    listen.translatesAutoresizingMaskIntoConstraints = false
    bodyCard.addSubview(listen)
    scroll.addSubview(bodyCard)
    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      scroll.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      scroll.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      bodyCard.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      bodyCard.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      bodyCard.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      bodyCard.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      bodyCard.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
      body.topAnchor.constraint(equalTo: bodyCard.topAnchor),
      body.leadingAnchor.constraint(equalTo: bodyCard.leadingAnchor),
      body.trailingAnchor.constraint(equalTo: bodyCard.trailingAnchor),
      body.bottomAnchor.constraint(equalTo: bodyCard.bottomAnchor),
      listen.trailingAnchor.constraint(equalTo: bodyCard.trailingAnchor, constant: -10),
      listen.centerYAnchor.constraint(equalTo: bodyCard.centerYAnchor),
    ])
    return panel
  }

  private func makeDictionaryLanguagePickerView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Dictionary Language") { [weak self] in
      self?.featureMode = .dictionary
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let header = makePickerSectionHeader("Language", scope: .dictionaryLanguage)
    header.translatesAutoresizingMaskIntoConstraints = false
    panel.addSubview(header)

    let scroll = makePickerScrollView(offsetKey: "dictionary-language")
    panel.addSubview(scroll)
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 5
    scroll.addSubview(stack)

    dictionarySupportedLanguages().forEach {
      stack.addArrangedSubview(makeDictionaryLanguageOptionButton($0))
    }

    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      header.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      header.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      header.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 4),
      scroll.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      scroll.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 2),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -2),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -4),
    ])
    return panel
  }

  private func makeDictionaryLanguageOptionButton(_ language: TranslationLanguage) -> UIButton {
    let isSelected = language.code.caseInsensitiveCompare(dictionaryLanguageCode) == .orderedSame
    let btn = KeyboardSelectionButton(
      title: language.name,
      isSelected: isSelected,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:dictionary-language:\(language.code)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        let previousLanguageCode = self.dictionaryLanguageCode
        self.dictionaryLanguageCode = language.code
        self.dictionaryLanguageName = language.name
        self.saveSharedLanguageSettings(dictionaryLanguage: language.name)
        self.clearToolbarError(.dictionary)
        self.featureMode = .dictionary
        self.rebuildKeyboard()

        self.autoLookupAfterDictionaryLanguageChange(previousCode: previousLanguageCode)
      }, for: .touchUpInside)
    return btn
  }

  private func makeKeyboardLanguagePickerView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear
    let backRow = makePanelHeader(title: "Keyboard Language") { [weak self] in
      self?.featureMode = .keyboard
      self?.rebuildKeyboard()
    }
    panel.addSubview(backRow)

    let scroll = makePickerScrollView(offsetKey: "keyboard-language")
    panel.addSubview(scroll)

    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 5
    scroll.addSubview(stack)

    stack.addArrangedSubview(makeSwitchKeyboardOptionButton())

    let title = UILabel()
    title.text = "Language"
    title.textColor = .secondaryLabel
    title.font = .systemFont(ofSize: panelCaptionFontSize)
    stack.addArrangedSubview(title)
    let available = supportedKeyboardLayoutLanguages
    available.forEach { stack.addArrangedSubview(makeKeyboardLanguageOptionButton($0)) }
    if available.count < keyboardLayoutPickerLanguages.count {
      stack.addArrangedSubview(makeComingSoonNote())
    }

    NSLayoutConstraint.activate([
      backRow.topAnchor.constraint(equalTo: panel.topAnchor, constant: 6),
      backRow.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      backRow.trailingAnchor.constraint(lessThanOrEqualTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.topAnchor.constraint(equalTo: backRow.bottomAnchor, constant: 8),
      scroll.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      scroll.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -8),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 2),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -2),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -4),
    ])
    return panel
  }

  private func makeSwitchKeyboardOptionButton() -> UIButton {
    let btn = KeyboardSelectionButton(
      title: "Switch keyboard",
      isSelected: false,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:keyboard-language:switch-keyboard"
    btn.addTarget(
      self, action: #selector(handleInputModeList(from:with:)),
      for: [
        .touchDown, .touchDownRepeat, .touchDragInside, .touchDragOutside, .touchDragEnter,
        .touchDragExit,
      ])
    return btn
  }

  private func makeKeyboardLanguageOptionButton(_ language: TranslationLanguage) -> UIButton {
    let btn = KeyboardSelectionButton(
      title: language.name,
      isSelected: language.code.caseInsensitiveCompare(keyboardLanguageCode) == .orderedSame,
      theme: settings.theme,
      fontSize: panelOptionFontSize)
    btn.accessibilityIdentifier = "picker:keyboard-language:\(language.code)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        self.setKeyboardLanguage(language, persist: true)
        self.boardMode = .alphabet
        self.featureMode = .keyboard
        self.rebuildKeyboard()
      }, for: .touchUpInside)
    return btn
  }

  private func makeComingSoonNote() -> UILabel {
    let note = UILabel()
    note.text = "More languages coming soon"
    note.textColor = .secondaryLabel
    note.font = .systemFont(ofSize: panelCaptionFontSize)
    note.textAlignment = .center
    note.heightAnchor.constraint(equalToConstant: 28).isActive = true
    return note
  }

  private func makeDictionaryResultView() -> UIView {
    let panel = UIView()
    panel.backgroundColor = .clear

    let topBar = UIView()
    topBar.translatesAutoresizingMaskIntoConstraints = false
    let closeBtn = makeRoundIconButton(
      imageName: "ic_audio_back", background: settings.theme.toolbar, tint: settings.theme.label,
      size: 32
    ) { [weak self] in
      self?.featureMode = .dictionary
      self?.rebuildKeyboard()
    }
    topBar.addSubview(closeBtn)
    NSLayoutConstraint.activate([
      closeBtn.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
      closeBtn.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
      closeBtn.widthAnchor.constraint(equalToConstant: 32),
      closeBtn.heightAnchor.constraint(equalToConstant: 32),
    ])
    panel.addSubview(topBar)

    let scroll = makePickerScrollView()
    panel.addSubview(scroll)

    let card = UIView()
    card.translatesAutoresizingMaskIntoConstraints = false
    card.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: KeySurface.controlRadius,
      tint: KeySurface.glyphTint)
    card.layer.borderColor = settings.theme.label.withAlphaComponent(0.12).cgColor
    card.layer.borderWidth = 0.5
    scroll.addSubview(card)

    let contentStack = UIStackView()
    contentStack.translatesAutoresizingMaskIntoConstraints = false
    contentStack.axis = .vertical
    contentStack.alignment = .fill
    contentStack.spacing = 12
    contentStack.isLayoutMarginsRelativeArrangement = true
    contentStack.layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
    card.addSubview(contentStack)

    if let result = latestDictionaryResult {
      contentStack.addArrangedSubview(makeDictionaryHeroView(result))
      if !result.definitions.isEmpty {
        contentStack.addArrangedSubview(makeDictionaryDivider())
        contentStack.addArrangedSubview(
          makeDictionarySection(
            title: "Definition", speechIdentifier: "definition",
            listenAction: { [weak self] in
              guard let self else { return }
              self.speakDictionaryText(
                self.dictionarySectionSpeechText(
                  title: "Definition", body: self.dictionaryDefinitionSpeechText(from: result)),
                identifier: "definition")
            }, body: makeDictionaryDefinitionsList(result.definitions)))
      }
      if !result.synonyms.isEmpty || !result.antonyms.isEmpty {
        contentStack.addArrangedSubview(makeDictionaryDivider())
        let variantsStack = UIStackView()
        variantsStack.translatesAutoresizingMaskIntoConstraints = false
        variantsStack.axis = .vertical
        variantsStack.alignment = .fill
        variantsStack.spacing = 10
        if !result.synonyms.isEmpty {
          variantsStack.addArrangedSubview(
            makeDictionaryTagSection(
              title: "Synonyms", items: result.synonyms, speechIdentifier: "synonyms",
              listenAction: { [weak self] in
                self?.speakDictionaryText(
                  self?.dictionaryTagSpeechText(title: "Synonyms", items: result.synonyms) ?? "",
                  identifier: "synonyms")
              }))
        }
        if !result.antonyms.isEmpty {
          variantsStack.addArrangedSubview(
            makeDictionaryTagSection(
              title: "Antonyms", items: result.antonyms, speechIdentifier: "antonyms",
              listenAction: { [weak self] in
                self?.speakDictionaryText(
                  self?.dictionaryTagSpeechText(title: "Antonyms", items: result.antonyms) ?? "",
                  identifier: "antonyms")
              }))
        }
        contentStack.addArrangedSubview(variantsStack)
      }
      let usageItems =
        result.usageExamples.isEmpty
        ? result.exampleSentences.map { DictionaryUsageItem(partOfSpeech: "", example: $0) }
        : result.usageExamples
      if !usageItems.isEmpty {
        contentStack.addArrangedSubview(makeDictionaryDivider())
        contentStack.addArrangedSubview(
          makeDictionarySection(
            title: "Usage Examples", speechIdentifier: "usage-examples",
            listenAction: { [weak self] in
              guard let self else { return }
              self.speakDictionaryText(
                self.dictionarySectionSpeechText(
                  title: "Usage Examples", body: self.dictionaryUsageSpeechText(from: result)),
                identifier: "usage-examples")
            }, body: makeDictionaryExamplesList(usageItems)))
      }
      if let cc = result.culturalContext, !cc.isEmpty {
        contentStack.addArrangedSubview(
          makeDictionaryQuoteCard(
            title: "Cultural Context", text: cc, speechIdentifier: "cultural-context",
            listenAction: { [weak self] in
              guard let self else { return }
              self.speakDictionaryText(
                self.dictionarySectionSpeechText(title: "Cultural Context", body: cc),
                identifier: "cultural-context")
            }))
      }
      if let ff = result.funFact, !ff.isEmpty {
        contentStack.addArrangedSubview(
          makeDictionaryQuoteCard(
            title: "Fun Fact", text: ff, speechIdentifier: "fun-fact",
            listenAction: { [weak self] in
              guard let self else { return }
              self.speakDictionaryText(
                self.dictionarySectionSpeechText(title: "Fun Fact", body: ff),
                identifier: "fun-fact")
            }))
      }
    } else {
      let body = PaddingLabel()
      body.translatesAutoresizingMaskIntoConstraints = false
      body.contentInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
      body.applyKeyAesthetics(
        background: settings.theme.key, cornerRadius: 18, tint: KeySurface.glyphTint)
      body.textColor = settings.theme.label
      body.font = .systemFont(ofSize: max(settings.fontSize - 1, 11))
      body.numberOfLines = 0
      body.text =
        latestDictionaryResultText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        ? latestDictionaryResultText : "No dictionary result was returned."
      contentStack.addArrangedSubview(body)
    }

    NSLayoutConstraint.activate([
      topBar.topAnchor.constraint(equalTo: panel.topAnchor, constant: 8),
      topBar.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      topBar.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      topBar.heightAnchor.constraint(equalToConstant: 34),
      scroll.topAnchor.constraint(equalTo: topBar.bottomAnchor, constant: 10),
      scroll.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: panelSideInset),
      scroll.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -panelSideInset),
      scroll.bottomAnchor.constraint(equalTo: panel.bottomAnchor, constant: -10),
      card.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      card.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      card.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      card.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      card.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
      contentStack.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      contentStack.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      contentStack.topAnchor.constraint(equalTo: card.topAnchor),
      contentStack.bottomAnchor.constraint(equalTo: card.bottomAnchor),
    ])
    return panel
  }

  private func makeDictionaryHeroView(_ result: DictionaryResultCardData) -> UIView {
    let hero = UIView()
    hero.translatesAutoresizingMaskIntoConstraints = false
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 6
    hero.addSubview(stack)

    let wordRow = UIStackView()
    wordRow.axis = .horizontal
    wordRow.alignment = .center
    wordRow.spacing = 10
    let wordTitleStack = UIStackView()
    wordTitleStack.axis = .horizontal
    wordTitleStack.alignment = .center
    wordTitleStack.spacing = 8
    let wordListenBtn = makeDictionaryListenButton(
      identifier: "hero-word",
      action: { [weak self] in
        self?.speakDictionaryText(result.word, identifier: "hero-word")
      }, background: settings.theme.toolbar, tint: settings.theme.label, size: 28, pointSize: 12)
    wordTitleStack.addArrangedSubview(wordListenBtn)
    let wordLabel = UILabel()
    wordLabel.text = result.word
    wordLabel.textColor = settings.theme.label
    wordLabel.font = .boldSystemFont(ofSize: max(settings.fontSize + 7, 22))
    wordLabel.numberOfLines = 2
    wordTitleStack.addArrangedSubview(wordLabel)
    wordRow.addArrangedSubview(wordTitleStack)
    wordRow.addArrangedSubview(UIView())
    let speakBtn = makeDictionaryListenButton(
      identifier: "hero",
      action: { [weak self] in
        guard let self else { return }
        self.speakDictionaryText(self.dictionarySpeechText(from: result), identifier: "hero")
      }, background: settings.theme.accent.withAlphaComponent(0.15), tint: settings.theme.accent,
      size: 36, pointSize: 14)
    wordRow.addArrangedSubview(speakBtn)
    stack.addArrangedSubview(wordRow)

    if let pron = result.pronunciation, !pron.isEmpty {
      let metaRow = UIStackView()
      metaRow.axis = .horizontal
      metaRow.alignment = .center
      metaRow.spacing = 8
      let pronLabel = UILabel()
      pronLabel.text = "/\(pron)/"
      pronLabel.textColor = settings.theme.label.withAlphaComponent(0.72)
      pronLabel.font = .italicSystemFont(ofSize: max(settings.fontSize - 2, 11))
      metaRow.addArrangedSubview(pronLabel)
      let langLabel = UILabel()
      langLabel.text = result.language
      langLabel.textColor = settings.theme.label.withAlphaComponent(0.72)
      langLabel.font = .systemFont(ofSize: max(settings.fontSize - 3, 11))
      metaRow.addArrangedSubview(langLabel)
      stack.addArrangedSubview(metaRow)
    }

    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: hero.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: hero.trailingAnchor),
      stack.topAnchor.constraint(equalTo: hero.topAnchor),
      stack.bottomAnchor.constraint(equalTo: hero.bottomAnchor),
    ])
    return hero
  }

  private func makeDictionarySection(
    title: String, speechIdentifier: String, listenAction: (() -> Void)?, body: UIView
  ) -> UIView {
    let section = UIStackView()
    section.translatesAutoresizingMaskIntoConstraints = false
    section.axis = .vertical
    section.alignment = .fill
    section.spacing = 6
    let header = UIStackView()
    header.axis = .horizontal
    header.alignment = .center
    header.spacing = 8
    let label = UILabel()
    label.text = title.uppercased()
    label.textColor = settings.theme.label.withAlphaComponent(0.72)
    label.font = .systemFont(ofSize: max(settings.fontSize - 2, 12), weight: .medium)
    header.addArrangedSubview(label)
    header.addArrangedSubview(UIView())
    if let listenAction {
      header.addArrangedSubview(
        makeDictionaryListenButton(identifier: speechIdentifier, action: listenAction))
    }
    section.addArrangedSubview(header)
    section.addArrangedSubview(body)
    return section
  }

  private func makeDictionaryDefinitionsList(_ definitions: [DictionaryDefinitionItem]) -> UIView {
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 6
    for d in definitions { stack.addArrangedSubview(makeDictionaryDefinitionRow(d)) }
    return stack
  }

  private func makeDictionaryDefinitionRow(_ definition: DictionaryDefinitionItem) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .top
    row.spacing = 6
    row.translatesAutoresizingMaskIntoConstraints = false
    let bullet = UIView()
    bullet.translatesAutoresizingMaskIntoConstraints = false
    bullet.backgroundColor = settings.theme.label
    bullet.layer.cornerRadius = 3
    bullet.widthAnchor.constraint(equalToConstant: 6).isActive = true
    bullet.heightAnchor.constraint(equalToConstant: 6).isActive = true
    let bStack = UIStackView(arrangedSubviews: [bullet, UIView()])
    bStack.axis = .vertical
    bStack.alignment = .center
    bStack.widthAnchor.constraint(equalToConstant: 6).isActive = true
    bStack.translatesAutoresizingMaskIntoConstraints = false
    row.addArrangedSubview(bStack)
    let textStack = UIStackView()
    textStack.axis = .vertical
    textStack.alignment = .fill
    textStack.spacing = 2
    textStack.translatesAutoresizingMaskIntoConstraints = false
    if let pos = definition.partOfSpeech, !pos.isEmpty {
      let posLabel = UILabel()
      posLabel.text = pos.capitalized
      posLabel.textColor = settings.theme.label
      posLabel.font = .boldSystemFont(ofSize: max(settings.fontSize - 3, 11))
      textStack.addArrangedSubview(posLabel)
    }
    let textLabel = UILabel()
    textLabel.translatesAutoresizingMaskIntoConstraints = false
    textLabel.numberOfLines = 0
    textLabel.lineBreakMode = .byWordWrapping
    textLabel.text = definition.text
    textLabel.textColor = settings.theme.label
    textLabel.font = .italicSystemFont(ofSize: max(settings.fontSize - 4, 11))
    textStack.addArrangedSubview(textLabel)
    row.addArrangedSubview(textStack)
    return row
  }

  private func makeDictionaryExamplesList(_ items: [DictionaryUsageItem]) -> UIView {
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 8
    for item in items { stack.addArrangedSubview(makeDictionaryExampleRow(item)) }
    return stack
  }

  private func makeDictionaryExampleRow(_ item: DictionaryUsageItem) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .top
    row.spacing = 10
    row.translatesAutoresizingMaskIntoConstraints = false
    let bar = UIView()
    bar.translatesAutoresizingMaskIntoConstraints = false
    bar.backgroundColor = settings.theme.label.withAlphaComponent(0.12)
    bar.layer.cornerRadius = 1.5
    bar.widthAnchor.constraint(equalToConstant: 3).isActive = true
    let vstack = UIStackView()
    vstack.axis = .vertical
    vstack.alignment = .fill
    vstack.spacing = 4
    vstack.translatesAutoresizingMaskIntoConstraints = false
    if !item.partOfSpeech.isEmpty {
      let posLabel = UILabel()
      posLabel.text = item.partOfSpeech.capitalized
      posLabel.textColor = settings.theme.label.withAlphaComponent(0.72)
      posLabel.font = .systemFont(ofSize: max(settings.fontSize - 4, 10), weight: .medium)
      vstack.addArrangedSubview(posLabel)
    }
    let exLabel = UILabel()
    exLabel.text = "\u{2018}\(item.example)\u{2019}"
    exLabel.textColor = settings.theme.label.withAlphaComponent(0.72)
    exLabel.font = .italicSystemFont(ofSize: max(settings.fontSize - 4, 11))
    exLabel.numberOfLines = 0
    vstack.addArrangedSubview(exLabel)
    row.addArrangedSubview(bar)
    row.addArrangedSubview(vstack)
    return row
  }

  private func makeDictionaryTagSection(
    title: String, items: [String], speechIdentifier: String, listenAction: (() -> Void)? = nil
  ) -> UIView {
    let section = UIStackView()
    section.translatesAutoresizingMaskIntoConstraints = false
    section.axis = .vertical
    section.alignment = .fill
    section.spacing = 8
    let header = UIStackView()
    header.axis = .horizontal
    header.alignment = .center
    header.spacing = 8
    let titleLabel = UILabel()
    titleLabel.text = title.uppercased()
    titleLabel.textColor = settings.theme.label.withAlphaComponent(0.72)
    titleLabel.font = .systemFont(ofSize: max(settings.fontSize - 4, 10), weight: .medium)
    header.addArrangedSubview(titleLabel)
    header.addArrangedSubview(UIView())
    if let listenAction {
      header.addArrangedSubview(
        makeDictionaryListenButton(identifier: speechIdentifier, action: listenAction))
    }
    section.addArrangedSubview(header)

    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.showsHorizontalScrollIndicator = false
    scroll.alwaysBounceHorizontal = true
    let chipsRow = UIStackView()
    chipsRow.translatesAutoresizingMaskIntoConstraints = false
    chipsRow.axis = .horizontal
    chipsRow.alignment = .center
    chipsRow.spacing = 8
    scroll.addSubview(chipsRow)
    for item in items { chipsRow.addArrangedSubview(makeDictionaryChip(item)) }
    NSLayoutConstraint.activate([
      chipsRow.leadingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 8),
      chipsRow.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -8),
      chipsRow.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      chipsRow.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      chipsRow.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor),
    ])
    scroll.heightAnchor.constraint(equalToConstant: 36).isActive = true
    section.addArrangedSubview(scroll)
    return section
  }

  private func makeDictionaryChip(_ text: String) -> UIView {
    let chip = UIView()
    chip.translatesAutoresizingMaskIntoConstraints = false
    chip.layer.borderColor = settings.theme.label.withAlphaComponent(0.12).cgColor
    chip.layer.borderWidth = 1
    chip.layer.cornerRadius = 10
    chip.backgroundColor = settings.theme.key
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = text
    label.font = .systemFont(ofSize: max(settings.fontSize - 3, 10))
    label.textColor = settings.theme.label
    chip.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: chip.leadingAnchor, constant: 12),
      label.trailingAnchor.constraint(equalTo: chip.trailingAnchor, constant: -12),
      label.topAnchor.constraint(equalTo: chip.topAnchor, constant: 6),
      label.bottomAnchor.constraint(equalTo: chip.bottomAnchor, constant: -6),
    ])
    return chip
  }

  private func makeDictionaryDivider() -> UIView {
    let d = UIView()
    d.translatesAutoresizingMaskIntoConstraints = false
    d.backgroundColor = settings.theme.label.withAlphaComponent(0.12)
    d.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
    return d
  }

  private func makeDictionaryQuoteCard(
    title: String, text: String, speechIdentifier: String, listenAction: (() -> Void)?
  ) -> UIView {
    let card = UIView()
    card.translatesAutoresizingMaskIntoConstraints = false
    card.backgroundColor = settings.theme.toolbar
    card.layer.cornerRadius = 18
    card.layer.masksToBounds = true
    card.layer.borderColor = settings.theme.label.withAlphaComponent(0.12).cgColor
    card.layer.borderWidth = 1
    let stack = UIStackView()
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .vertical
    stack.alignment = .fill
    stack.spacing = 10
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
    card.addSubview(stack)
    let header = UIStackView()
    header.axis = .horizontal
    header.alignment = .center
    header.spacing = 8
    let label = UILabel()
    label.text = title.uppercased()
    label.textColor = settings.theme.label.withAlphaComponent(0.72)
    label.font = .systemFont(ofSize: max(settings.fontSize - 5, 10), weight: .medium)
    header.addArrangedSubview(label)
    header.addArrangedSubview(UIView())
    if let listenAction {
      header.addArrangedSubview(
        makeDictionaryListenButton(identifier: speechIdentifier, action: listenAction))
    }
    let bodyLabel = UILabel()
    bodyLabel.text = text
    bodyLabel.textColor = settings.theme.label
    bodyLabel.font = .systemFont(ofSize: max(settings.fontSize - 1, 12))
    bodyLabel.numberOfLines = 0
    stack.addArrangedSubview(header)
    stack.addArrangedSubview(bodyLabel)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      stack.topAnchor.constraint(equalTo: card.topAnchor),
      stack.bottomAnchor.constraint(equalTo: card.bottomAnchor),
    ])
    return card
  }

  private func makeDictionaryListenButton(
    identifier: String, action: @escaping () -> Void, background: UIColor? = nil,
    tint: UIColor? = nil, size: CGFloat = 28, pointSize: CGFloat = 14
  ) -> UIButton {
    let bg = background ?? settings.theme.toolbar
    let fg = tint ?? settings.theme.label
    let isLoading = isTtsLoading && activeDictionarySpeechIdentifier == identifier
    let isActive = isTtsPlaying && activeDictionarySpeechIdentifier == identifier
    let btn = makeRoundBaseButton(background: bg, size: size)
    btn.tintColor = fg
    btn.setImage(
      sfSymbol(isActive ? "stop.fill" : "speaker.wave.2.fill", size: pointSize), for: .normal)
    btn.imageView?.contentMode = .scaleAspectFit
    let inset = max(4, size * 0.18)
    btn.contentEdgeInsets = UIEdgeInsets(top: inset, left: inset, bottom: inset, right: inset)
    btn.accessibilityIdentifier = "listen-button-\(identifier)"
    btn.addAction(
      UIAction { [weak self] _ in
        guard let self else { return }
        let hasAnyTtsState =
          self.isTtsLoading || self.isTtsPlaying || self.isTtsPaused || self.ttsAudioData != nil
        if self.activeDictionarySpeechIdentifier == identifier, hasAnyTtsState {
          self.stopTts()
          return
        }
        if hasAnyTtsState { self.stopTts() }
        action()
      }, for: .touchUpInside)
    dictionaryListenButtons[identifier] = btn
    if isLoading {
      btn.setImage(nil, for: .normal)
      embedSpinner(in: btn, color: fg)
    }
    return btn
  }

  private func dictionarySpeechText(from result: DictionaryResultCardData) -> String {
    var parts = [String]()
    parts.append(dictionarySectionSpeechText(title: "Word", body: result.word))
    let def = dictionaryDefinitionSpeechText(from: result)
    if !def.isEmpty { parts.append(dictionarySectionSpeechText(title: "Definition", body: def)) }
    if !result.synonyms.isEmpty {
      parts.append(
        dictionarySectionSpeechText(
          title: "Synonyms", body: result.synonyms.joined(separator: ", ")))
    }
    if !result.antonyms.isEmpty {
      parts.append(
        dictionarySectionSpeechText(
          title: "Antonyms", body: result.antonyms.joined(separator: ", ")))
    }
    let usage = dictionaryUsageSpeechText(from: result)
    if !usage.isEmpty {
      parts.append(dictionarySectionSpeechText(title: "Usage Examples", body: usage))
    }
    if let cc = result.culturalContext, !cc.isEmpty {
      parts.append(dictionarySectionSpeechText(title: "Cultural Context", body: cc))
    }
    if let ff = result.funFact, !ff.isEmpty {
      parts.append(dictionarySectionSpeechText(title: "Fun Fact", body: ff))
    }
    return parts.joined(separator: ". ")
  }

  private func dictionaryDefinitionSpeechText(from result: DictionaryResultCardData) -> String {
    result.definitions.map { d in
      if let pos = d.partOfSpeech, !pos.isEmpty { return "\(pos). \(d.text)" }
      return d.text
    }.joined(separator: ". ")
  }

  private func dictionaryUsageSpeechText(from result: DictionaryResultCardData) -> String {
    if !result.usageExamples.isEmpty {
      return result.usageExamples.map { u in
        u.partOfSpeech.isEmpty ? u.example : "\(u.partOfSpeech). \(u.example)"
      }.joined(separator: ". ")
    }
    return result.exampleSentences.joined(separator: ". ")
  }

  private func dictionaryTagSpeechText(title: String, items: [String]) -> String {
    "\(title). \(items.joined(separator: ", "))"
  }

  private func dictionarySectionSpeechText(title: String, body: String) -> String {
    let t = body.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? title : "\(title). \(t)"
  }

  private func speakDictionaryText(_ text: String, identifier: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    startDictionaryTts(text: trimmed, language: dictionaryLanguageName, identifier: identifier)
  }

  private func beginTtsRequest() -> Int {
    ttsRequestGeneration += 1
    return ttsRequestGeneration
  }

  private func isCurrentTtsRequest(_ generation: Int, dictionaryIdentifier: String? = nil) -> Bool {
    guard generation == ttsRequestGeneration else { return false }
    if let dictionaryIdentifier {
      return activeDictionarySpeechIdentifier == dictionaryIdentifier
    }
    return activeDictionarySpeechIdentifier == nil
  }

  private func failDictionaryTts(
    identifier: String, generation: Int, message: String = KeyboardErrorCatalog.noAudio
  ) {
    guard isCurrentTtsRequest(generation, dictionaryIdentifier: identifier) else { return }
    isTtsLoading = false
    isTtsPlaying = false
    isTtsPaused = false
    ttsAudioPlayer = nil
    ttsAudioData = nil
    updateListenButtonLoading(identifier, isLoading: false)
    activeDictionarySpeechIdentifier = nil
    applyToolbarTheme()
    showToolbarError(.dictionary, message)
  }

  private func triggerDictionaryLookup(preferredWord: String? = nil) {
    guard !isDictionaryLoading else { return }
    let sourceWord =
      preferredWord?.trimmingCharacters(in: .whitespacesAndNewlines) ?? dictionarySourceText()
    guard !sourceWord.isEmpty else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.noWord)
      return
    }
    guard hasFullAccess else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.fullAccessNeeded)
      return
    }
    guard let url = apiURL("/dictionary") else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.tryAgain)
      return
    }

    clearToolbarError(.dictionary)
    isDictionaryLoading = true
    lastSentDictionarySourceText = sourceWord
    dictionaryTask?.cancel()
    rebuildKeyboard()

    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    let serviceModel = KeyboardLanguageCatalog.resolveDictionary(
      selectedProvider: settings.dictionaryProvider, selectedModel: settings.dictionaryModel)
    let payload: [String: Any] = [
      "word": sourceWord,
      "language": dictionaryLanguageName,
      "provider": serviceModel.provider,
      "model_name": serviceModel.model,
    ]
    devLog(
      "[Dictionary] ▶ word=%@ language=%@ model=%@",
      sourceWord, dictionaryLanguageName, settings.dictionaryModel)

    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = 45
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if !token.isEmpty { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

    dictionaryTask = URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        self.isDictionaryLoading = false
        defer { self.rebuildKeyboard() }
        if let error = error {
          if (error as NSError).code == NSURLErrorCancelled { return }
          devLog("[Dictionary] ✗ %@", error.localizedDescription)
          self.showToolbarError(.dictionary, KeyboardErrorCatalog.network(error))
          return
        }
        if let http = response as? HTTPURLResponse {
          devLog("[Dictionary] ◀ status=%d", http.statusCode)
          guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 {
              self.showLoginRequired()
              return
            }
            self.showToolbarError(.dictionary, KeyboardErrorCatalog.http(http.statusCode))
            return
          }
        }
        guard let data else {
          self.showToolbarError(.dictionary, KeyboardErrorCatalog.noResult)
          return
        }
        let bodyStr = String(data: data, encoding: .utf8) ?? "<binary>"
        devLog("[Dictionary] ◀ body=%@", bodyStr)
        if let parsed = self.parseDictionaryResult(from: bodyStr, fallbackWord: sourceWord) {
          self.latestDictionaryResult = parsed
          self.latestDictionaryResultText = self.formatDictionaryResult(
            from: bodyStr, fallbackWord: sourceWord)
          self.featureMode = .dictionaryResult
          self.clearToolbarError(.dictionary)
        } else {
          self.latestDictionaryResult = nil
          self.latestDictionaryResultText = nil
          self.showToolbarError(.dictionary, KeyboardErrorCatalog.noResult)
        }
      }
    }
    dictionaryTask?.resume()
  }

  private func dictionarySourceText() -> String {
    let context = limitedTextContext()
    let selection = context.selected.trimmingCharacters(in: .whitespacesAndNewlines)
    if !selection.isEmpty { return selection }
    let word = cursorContext().currentWord
    if !word.isEmpty { return word }
    return (context.before + context.after).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func autoLookupAfterDictionaryLanguageChange(previousCode: String) {
    guard settings.autoLookupOnLanguageChange,
      dictionaryLanguageCode.caseInsensitiveCompare(previousCode) != .orderedSame,
      let word = lastSentDictionarySourceText,
      !word.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return }
    triggerDictionaryLookup(preferredWord: word)
  }

  private func startDictionaryTts(text: String, language: String, identifier: String) {
    guard !isTtsLoading else { return }
    if isTtsPlaying {
      stopTts()
      return
    }
    guard hasFullAccess else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.fullAccessNeeded)
      return
    }
    guard let url = apiURL("/dictionary/tts") else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.tryAgain)
      return
    }
    let serviceModel = resolvedTtsServiceModel()
    let voice = resolvedTtsVoice(forLanguage: language)
    guard !voice.isEmpty else {
      showToolbarError(.dictionary, KeyboardErrorCatalog.noVoice)
      return
    }
    let generation = beginTtsRequest()
    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    let payload: [String: Any] = [
      "text": text, "voice": voice,
      "preset": [
        "provider": serviceModel.provider,
        "model": serviceModel.model, "language": language,
        "max_new_tokens": 2048,
      ],
    ]
    devLog(
      "[DictionaryTTS] ▶ voice=%@ language=%@ text=%@", voice, language, String(text.prefix(80)))
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.timeoutInterval = 45
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if !token.isEmpty { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

    activeDictionarySpeechIdentifier = identifier
    ttsAudioPlayer = nil
    ttsAudioData = nil
    isTtsLoading = true
    isTtsPlaying = false
    isTtsPaused = false
    updateListenButtonLoading(identifier, isLoading: true)
    applyToolbarTheme()

    ttsTask = URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard self.isCurrentTtsRequest(generation, dictionaryIdentifier: identifier) else { return }
        if let error = error {
          if (error as NSError).code == NSURLErrorCancelled { return }
          devLog("[DictionaryTTS] ✗ %@", error.localizedDescription)
          self.failDictionaryTts(
            identifier: identifier, generation: generation,
            message: KeyboardErrorCatalog.network(error))
          return
        }
        if let errMsg = self.checkHttpError(
          response: response, data: data, context: "DictionaryTTS")
        {
          self.failDictionaryTts(
            identifier: identifier, generation: generation, message: errMsg)
          return
        }
        guard let data else {
          self.failDictionaryTts(identifier: identifier, generation: generation)
          return
        }
        if let audioData = self.extractAudioData(from: data) {
          self.playTtsAudio(audioData, generation: generation, dictionaryIdentifier: identifier)
        } else {
          devLog("[DictionaryTTS] ✗ Missing audio_b64")
          self.failDictionaryTts(
            identifier: identifier, generation: generation, message: KeyboardErrorCatalog.noAudio)
        }
      }
    }
    ttsTask?.resume()
  }

  private func extractAudioData(from data: Data) -> Data? {
    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if let resp = json["response"] as? [String: Any], let b64 = resp["audio_b64"] as? String,
        let audioData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
      {
        return audioData
      }
      if let b64 = json["audio_b64"] as? String,
        let audioData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
      {
        return audioData
      }
      if let nested = json["data"] as? [String: Any], let b64 = nested["audio_b64"] as? String,
        let audioData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
      {
        return audioData
      }
    }
    if let body = String(data: data, encoding: .utf8) {
      let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
      if let audioData = Data(base64Encoded: trimmed, options: .ignoreUnknownCharacters),
        audioData.count > 100
      {
        return audioData
      }
    }
    return nil
  }

  private func updateListenButtonLoading(_ identifier: String?, isLoading: Bool) {
    guard let identifier else { return }
    if let btn = dictionaryListenButtons[identifier] {
      updateButtonLoadingState(btn, isLoading: isLoading)
      return
    }
    findAndUpdateListenButton(
      in: fullPanelView ?? view, identifier: identifier, isLoading: isLoading)
  }

  private func findAndUpdateListenButton(in view: UIView, identifier: String, isLoading: Bool) {
    if let btn = view as? UIButton, btn.accessibilityIdentifier == "listen-button-\(identifier)" {
      updateButtonLoadingState(btn, isLoading: isLoading)
      return
    }
    for sub in view.subviews {
      findAndUpdateListenButton(in: sub, identifier: identifier, isLoading: isLoading)
    }
  }

  private func updateButtonLoadingState(_ button: UIButton, isLoading: Bool) {
    if isLoading {
      button.subviews.compactMap { $0 as? UIActivityIndicatorView }.forEach {
        $0.stopAnimating()
        $0.removeFromSuperview()
      }
      button.imageView?.isHidden = true
      button.setImage(nil, for: .normal)
      let spinner = UIActivityIndicatorView(style: .medium)
      spinner.translatesAutoresizingMaskIntoConstraints = false
      spinner.color = button.tintColor ?? settings.theme.label
      spinner.startAnimating()
      button.addSubview(spinner)
      NSLayoutConstraint.activate([
        spinner.centerXAnchor.constraint(equalTo: button.centerXAnchor),
        spinner.centerYAnchor.constraint(equalTo: button.centerYAnchor),
      ])
    } else {
      button.subviews.compactMap { $0 as? UIActivityIndicatorView }.forEach {
        $0.stopAnimating()
        $0.removeFromSuperview()
      }
      button.imageView?.isHidden = false
      let isActive =
        isTtsPlaying
        && activeDictionarySpeechIdentifier
          == button.accessibilityIdentifier?.replacingOccurrences(of: "listen-button-", with: "")
      button.setImage(
        sfSymbol(isActive ? "stop.fill" : "speaker.wave.2.fill", size: 14), for: .normal)
    }
  }

  private func parseDictionaryResult(from body: String, fallbackWord: String)
    -> DictionaryResultCardData?
  {
    let jsonBody = extractJsonBody(body)
    guard let data = jsonBody.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { return nil }
      return DictionaryResultCardData(
        word: fallbackWord, language: dictionaryLanguageName, pronunciation: nil, partOfSpeech: nil,
        definitions: [DictionaryDefinitionItem(partOfSpeech: nil, text: trimmed, context: nil)],
        usageExamples: [], synonyms: [], antonyms: [], exampleSentences: [], culturalContext: nil,
        funFact: nil)
    }
    let payload = (root["data"] as? [String: Any]) ?? root
    let word = stringValue(payload["word"]) ?? fallbackWord
    let language = stringValue(payload["language"]) ?? dictionaryLanguageName
    let pronunciation = stringValue(payload["phonetic"]) ?? stringValue(payload["pronunciation"])
    let definitions = parseDictionaryDefinitionItems(payload["definitions"])
    let usageExamples = parseDictionaryUsageItems(payload["usage"] ?? payload["usageExamples"])
    let exampleSentences = parseDictionaryStringArray(payload["exampleSentences"])
    let synonyms = parseDictionaryStringArray(payload["syms"] ?? payload["synonyms"])
    let antonyms = parseDictionaryStringArray(payload["antm"] ?? payload["antonyms"])
    let partOfSpeech = stringValue(payload["partOfSpeech"]) ?? definitions.first?.partOfSpeech
    let fallbackDef = DictionaryDefinitionItem(
      partOfSpeech: partOfSpeech,
      text: stringValue(payload["definition"]) ?? stringValue(payload["meaning"])
        ?? body.trimmingCharacters(in: .whitespacesAndNewlines), context: nil)
    return DictionaryResultCardData(
      word: word, language: language, pronunciation: pronunciation, partOfSpeech: partOfSpeech,
      definitions: definitions.isEmpty ? [fallbackDef] : definitions,
      usageExamples: usageExamples.isEmpty && !exampleSentences.isEmpty
        ? exampleSentences.map { DictionaryUsageItem(partOfSpeech: "", example: $0) }
        : usageExamples,
      synonyms: synonyms, antonyms: antonyms, exampleSentences: exampleSentences,
      culturalContext: parseDictionarySectionText(payload["cultural_context"])
        ?? stringValue(payload["culturalContext"]),
      funFact: parseDictionarySectionText(payload["fun_facts"]) ?? stringValue(payload["funFact"]))
  }

  private func formatDictionaryResult(from body: String, fallbackWord: String) -> String? {
    guard let data = extractJsonBody(body).data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return body.trimmingCharacters(in: .whitespacesAndNewlines) }
    let payload = (root["data"] as? [String: Any]) ?? root
    var parts = [
      "Word: \(stringValue(payload["word"]) ?? fallbackWord)",
      "Language: \(stringValue(payload["language"]) ?? dictionaryLanguageName)",
    ]
    let defs = parseDictionaryDefinitionItems(payload["definitions"])
    if !defs.isEmpty {
      parts.append(
        "Definitions:\n"
          + defs.map { "• \($0.partOfSpeech.map { "\($0): " } ?? "")\($0.text)" }.joined(
            separator: "\n"))
    }
    let syns = parseDictionaryStringArray(payload["syms"] ?? payload["synonyms"])
    if !syns.isEmpty {
      parts.append("Synonyms:\n" + syns.map { "• \($0)" }.joined(separator: "\n"))
    }
    let ants = parseDictionaryStringArray(payload["antm"] ?? payload["antonyms"])
    if !ants.isEmpty {
      parts.append("Antonyms:\n" + ants.map { "• \($0)" }.joined(separator: "\n"))
    }
    return parts.joined(separator: "\n\n")
  }

  private func parseDictionaryDefinitionItems(_ value: Any?) -> [DictionaryDefinitionItem] {
    guard let items = value as? [[String: Any]], !items.isEmpty else { return [] }
    return items.compactMap { item in
      guard let text = stringValue(item["text"]) ?? stringValue(item["definition"]) else {
        return nil
      }
      return DictionaryDefinitionItem(
        partOfSpeech: stringValue(item["partOfSpeech"]) ?? stringValue(item["type"]), text: text,
        context: stringValue(item["context"]))
    }
  }

  private func parseDictionaryUsageItems(_ value: Any?) -> [DictionaryUsageItem] {
    guard let items = value as? [[String: Any]], !items.isEmpty else { return [] }
    return items.compactMap { item in
      guard let example = stringValue(item["example"]) ?? stringValue(item["text"]) else {
        return nil
      }
      return DictionaryUsageItem(
        partOfSpeech: stringValue(item["partOfSpeech"]) ?? stringValue(item["type"]) ?? "",
        example: example)
    }
  }

  private func parseDictionarySectionText(_ value: Any?) -> String? {
    guard let items = value as? [[String: Any]], !items.isEmpty else { return nil }
    let texts = items.compactMap { stringValue($0["text"]) ?? stringValue($0["definition"]) }.filter
    { !$0.isEmpty }
    return texts.isEmpty ? nil : texts.joined(separator: ". ")
  }

  private func parseDictionaryStringArray(_ value: Any?) -> [String] {
    guard let items = value as? [String], !items.isEmpty else { return [] }
    return items.compactMap { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter {
      !$0.isEmpty
    }
  }

  private func stringValue(_ value: Any?) -> String? {
    guard let s = value as? String else { return nil }
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }

  private func makeInlineErrorLabel(_ message: String, slot: ToolbarErrorSlot) -> UILabel {
    let label = UILabel()
    label.tag = slot.rawValue
    label.isUserInteractionEnabled = true
    label.addGestureRecognizer(
      UITapGestureRecognizer(target: self, action: #selector(dismissToolbarErrorTap(_:))))
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "⚠ \(message)"
    label.textColor = UIColor(hex: "#EF4444")
    label.font = .systemFont(ofSize: panelCaptionFontSize, weight: .medium)
    label.textAlignment = .center
    label.numberOfLines = 1
    label.lineBreakMode = .byTruncatingTail
    label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    return label
  }

  private func makeCancelButton(action: @escaping () -> Void) -> UIButton {
    let btn = UIButton(type: .system)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.setImage(UIImage(named: "ic_clear_text")?.withRenderingMode(.alwaysTemplate), for: .normal)
    btn.imageView?.contentMode = .scaleAspectFit
    btn.applyKeyAesthetics(
      background: settings.theme.key, cornerRadius: 14, tint: KeySurface.glyphTint,
      pressedColor: settings.theme.keyPressed)
    btn.tintColor = settings.theme.label
    btn.widthAnchor.constraint(equalToConstant: 28).isActive = true
    btn.heightAnchor.constraint(equalToConstant: 28).isActive = true
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func applyHeaderConstraints(
    header: UIView, cancel: UIView, center: UIView, action: UIView
  ) {
    NSLayoutConstraint.activate([
      cancel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: panelSideInset),
      cancel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      center.centerXAnchor.constraint(equalTo: header.centerXAnchor),
      center.centerYAnchor.constraint(equalTo: header.centerYAnchor),
      center.leadingAnchor.constraint(greaterThanOrEqualTo: cancel.trailingAnchor, constant: 8),
      center.trailingAnchor.constraint(lessThanOrEqualTo: action.leadingAnchor, constant: -8),
      action.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -panelSideInset),
      action.centerYAnchor.constraint(equalTo: header.centerYAnchor),
    ])
  }


  private func makePanelHeader(title: String, action: @escaping () -> Void) -> UIStackView {
    let row = UIStackView()
    row.translatesAutoresizingMaskIntoConstraints = false
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 8
    row.addArrangedSubview(
      makeRoundIconButton(
        imageName: "ic_audio_back", background: settings.theme.key, tint: settings.theme.label,
        size: 32, action: action))
    let lbl = UILabel()
    lbl.text = title
    lbl.textColor = .label
    lbl.font = .systemFont(ofSize: panelTitleFontSize, weight: .medium)
    row.addArrangedSubview(lbl)
    return row
  }

  private func makeDoneButton(action: @escaping () -> Void) -> UIButton {
    let btn = UIButton(type: .system)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(
      background: settings.theme.accent, cornerRadius: 19, tint: KeySurface.glyphTint,
      pressedColor: settings.theme.keyPressed)
    btn.setTitle("Done", for: .normal)
    btn.setTitleColor(.white, for: .normal)
    btn.titleLabel?.font = .systemFont(ofSize: settings.fontSize, weight: .medium)
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func makePillButton(
    title: String, background: UIColor, foreground: UIColor, minWidth: CGFloat = 0,
    action: @escaping () -> Void
  ) -> UIButton {
    let btn = UIButton(type: .system)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(
      background: background, cornerRadius: 15, pressedColor: settings.theme.keyPressed)
    btn.setTitle(title, for: .normal)
    btn.setTitleColor(foreground, for: .normal)
    btn.titleLabel?.font = .systemFont(ofSize: panelOptionFontSize, weight: .medium)
    btn.contentEdgeInsets = UIEdgeInsets(top: 6, left: 10, bottom: 6, right: 10)
    btn.heightAnchor.constraint(greaterThanOrEqualToConstant: 30).isActive = true
    if minWidth > 0 {
      btn.widthAnchor.constraint(greaterThanOrEqualToConstant: minWidth).isActive = true
    }
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func makeIconPillButton(
    imageName: String, background: UIColor, foreground: UIColor, minWidth: CGFloat = 0,
    enabled: Bool = true,
    action: @escaping () -> Void
  ) -> UIButton {
    let btn = UIButton(type: .system)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(
      background: background, cornerRadius: 15, tint: KeySurface.glyphTint,
      pressedColor: settings.theme.keyPressed)
    btn.tintColor = foreground
    btn.setImage(UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate), for: .normal)
    btn.imageView?.contentMode = .scaleAspectFit
    btn.contentEdgeInsets = UIEdgeInsets(top: 7, left: 8, bottom: 7, right: 8)
    btn.heightAnchor.constraint(greaterThanOrEqualToConstant: 30).isActive = true
    if minWidth > 0 {
      btn.widthAnchor.constraint(greaterThanOrEqualToConstant: minWidth).isActive = true
    }
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    btn.isEnabled = enabled
    btn.alpha = enabled ? 1 : 0.4
    return btn
  }

  private func makeRoundBaseButton(background: UIColor, size: CGFloat = 34) -> UIButton {
    let btn = UIButton(type: .system)
    btn.translatesAutoresizingMaskIntoConstraints = false
    btn.applyKeyAesthetics(
      background: background, cornerRadius: size / 2, tint: KeySurface.glyphTint,
      pressedColor: settings.theme.keyPressed)
    btn.widthAnchor.constraint(equalToConstant: size).isActive = true
    btn.heightAnchor.constraint(equalToConstant: size).isActive = true
    return btn
  }

  private func makeRoundIconButton(
    imageName: String, background: UIColor, tint: UIColor, size: CGFloat = 34,
    action: @escaping () -> Void
  ) -> UIButton {
    let btn = makeRoundBaseButton(background: background, size: size)
    btn.tintColor = tint
    btn.setImage(UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate), for: .normal)
    btn.imageView?.contentMode = .scaleAspectFit
    btn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func embedSpinner(in button: UIButton, color: UIColor) {
    let s = UIActivityIndicatorView(style: .medium)
    s.translatesAutoresizingMaskIntoConstraints = false
    s.color = color
    s.startAnimating()
    button.addSubview(s)
    NSLayoutConstraint.activate([
      s.centerXAnchor.constraint(equalTo: button.centerXAnchor),
      s.centerYAnchor.constraint(equalTo: button.centerYAnchor),
    ])
  }

  private func sfSymbol(_ name: String, size: CGFloat, weight: UIImage.SymbolWeight = .bold)
    -> UIImage?
  {
    UIImage(
      systemName: name,
      withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: weight))?
      .withRenderingMode(.alwaysTemplate)
  }

  private func makeShareControlButton(action: @escaping () -> Void) -> UIButton {
    let btn = makeRoundBaseButton(background: .clear, size: 26)
    btn.setImage(sfSymbol("square.and.arrow.up", size: 11), for: .normal)
    btn.tintColor = settings.theme.label
    btn.contentEdgeInsets = UIEdgeInsets(top: 6, left: 7, bottom: 8, right: 7)
    btn.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return btn
  }

  private func shareTtsAudio() {
    guard let data = ttsAudioData else { return }
    shareCompatibleAudio(data, baseName: "hypa-speech")
  }

  private func shareSttRecording() {
    guard let data = sttRecordedWav else { return }
    shareCompatibleAudio(data, baseName: "hypa-recording")
  }

  private func shareCompatibleAudio(_ data: Data, baseName: String) {
    guard hasFullAccess, !data.isEmpty else { return }
    let ext = audioFileExtension(for: data)
    if ext == "wav" {
      transcodeToM4A(data: data) { [weak self] url in
        guard let self else { return }
        if let url {
          self.presentShareSheet(for: url)
        } else {
          self.shareRawAudio(data, fileName: "\(baseName).wav")
        }
      }
    } else {
      shareRawAudio(data, fileName: "\(baseName).\(ext)")
    }
  }

  private func shareRawAudio(_ data: Data, fileName: String) {
    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      devLog("[SHARE] ✗ write failed: %@", error.localizedDescription)
      return
    }
    presentShareSheet(for: url)
  }

  private func presentShareSheet(for url: URL) {
    guard hasFullAccess else { return }
    let activityVC = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    if let popover = activityVC.popoverPresentationController {
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    present(activityVC, animated: true)
  }

  private func audioFileExtension(for data: Data) -> String {
    func match(_ offset: Int, _ sig: [UInt8]) -> Bool {
      guard data.count >= offset + sig.count else { return false }
      for (i, byte) in sig.enumerated() where data[data.startIndex + offset + i] != byte {
        return false
      }
      return true
    }
    if match(0, [0x52, 0x49, 0x46, 0x46]) && match(8, [0x57, 0x41, 0x56, 0x45]) {
      return "wav"
    }
    if match(4, [0x66, 0x74, 0x79, 0x70]) {
      return "m4a"
    }
    if match(0, [0x4F, 0x67, 0x67, 0x53]) {
      return "ogg"
    }
    if match(0, [0x49, 0x44, 0x33]) {
      return "mp3"
    }
    if data.count >= 2,
      data[data.startIndex] == 0xFF, (data[data.startIndex + 1] & 0xE0) == 0xE0
    {
      return "mp3"
    }
    return "mp3"
  }

  private func transcodeToM4A(data: Data, completion: @escaping (URL?) -> Void) {
    let srcURL = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("hypa-src-\(UUID().uuidString).wav")
    do {
      try data.write(to: srcURL, options: .atomic)
    } catch {
      completion(nil)
      return
    }
    let asset = AVURLAsset(url: srcURL)
    guard
      let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A)
    else {
      try? FileManager.default.removeItem(at: srcURL)
      completion(nil)
      return
    }
    let outURL = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("hypa-recording-\(UUID().uuidString).m4a")
    try? FileManager.default.removeItem(at: outURL)
    export.outputURL = outURL
    export.outputFileType = .m4a
    export.exportAsynchronously {
      DispatchQueue.main.async {
        try? FileManager.default.removeItem(at: srcURL)
        completion(export.status == .completed ? outURL : nil)
      }
    }
  }

  private func buildAlphaRows() {
    currentRows = KeyboardLanguageCatalog.alphabetRows(languageCode: activeKeyboardLanguageCode())
    buildKeyButtons(rows: currentRows)
  }

  private static let symbolPunctuationRow = [".", ",", "?", "!", "'"]

  private var symbolPunctuationKeys: [String] {
    contextMode == .email ? [".", "@", "?", "!", "'"] : Self.symbolPunctuationRow
  }

  private func buildSymbolRows() {
    let punctuation = symbolPunctuationKeys
    currentRows =
      boardMode == .symbolsExtended
      ? [
        ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="],
        ["_", "\\", "|", "~", "<", ">", "€", "£", "¥", "•"],
        punctuation,
      ]
      : [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
        punctuation,
      ]
    buildKeyButtons(rows: currentRows)
  }

  private func buildNumericRows() {
    currentRows = [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      [numericCorner, "0", "backspace"],
    ]
    buildKeyButtons(rows: currentRows)
  }

  private static func numericCornerKey(for type: UIKeyboardType) -> String {
    switch type {
    case .phonePad, .namePhonePad: return "+"
    case .decimalPad, .numbersAndPunctuation: return "."
    default: return ""
    }
  }

  private static let numericSubtitles: [String: String] = [
    "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL",
    "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
  ]

  @discardableResult
  private func syncBoardModeToHostField() -> Bool {
    let type = textDocumentProxy.keyboardType ?? .default
    guard type != appliedKeyboardType else { return false }
    let previousBottomRow = bottomRowKeys()
    appliedKeyboardType = type
    let wantsNumeric: Bool
    switch type {
    case .numberPad, .asciiCapableNumberPad, .decimalPad, .numbersAndPunctuation,
      .phonePad, .namePhonePad:
      wantsNumeric = true
    default:
      wantsNumeric = false
    }
    let corner = Self.numericCornerKey(for: type)
    let next: KeyboardBoardMode = wantsNumeric ? .numeric : .alphabet
    let changed = next != boardMode || (next == .numeric && corner != numericCorner)
    numericCorner = corner
    boardMode = next
    return changed || bottomRowKeys() != previousBottomRow
  }

  private func buildKeyButtons(rows: [[String]]) {
    for row in rows { for key in row where !key.isEmpty { addKey(key) } }
  }
  private func thirdRowEdgeKeys() -> [String] {
    switch boardMode {
    case .symbols: return ["symbols-extended", "backspace"]
    case .symbolsExtended: return ["symbols-basic", "backspace"]
    default: return ["shift", "backspace"]
    }
  }

  private func buildThirdRowKeys() { thirdRowEdgeKeys().forEach { addKey($0) } }
  private func bottomRowKeys() -> [String] {
    let modeKey = boardMode == .alphabet ? "symbols" : "alpha"
    guard boardMode == .alphabet, appliedKeyboardType == .emailAddress else {
      return [modeKey, "emoji", "space", "return"]
    }
    return [modeKey, "emoji", "space", "@", "return"]
  }

  private func buildBottomRowKeys() {
    bottomRowKeys().forEach { addKey($0) }
  }

  private func addKey(_ key: String) {
    let btn = makeButton(for: key)
    btn.keyName = key
    buttonByKey[key] = btn
    keyButtons.append(btn)
    keyHostView().addSubview(btn)
  }

  private func keyHostView() -> UIView {
    if let container = keyGlassContainer { return container.contentView }
    if let existing = keyHost { return existing }
    let host = KeyHostView()
    host.frame = view.bounds
    host.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    host.isMultipleTouchEnabled = true
    host.touchDelegate = self
    letterPriorKey = nil
    host.letterPrior = { [weak self] in self?.currentLetterPrior() ?? [:] }
    host.showsHitSlop = showHitSlopOverlay
    host.holdDuration = Double(settings.longPressDurationMs) / 1000
    host.backgroundColor = UIColor.black.withAlphaComponent(0.002)
    view.insertSubview(host, at: 0)
    keyHost = host
    if #available(iOS 26.0, *) {
      let containerEffect = UIGlassContainerEffect()
      containerEffect.spacing = 0
      let container = UIVisualEffectView(effect: containerEffect)
      container.frame = host.bounds
      container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      host.addSubview(container)
      keyGlassContainer = container
      return container.contentView
    }
    return host
  }

  private func recycleKeyButtons() {
    keyButtons.forEach { button in
      button.removeFromSuperview()
      button.removeTarget(nil, action: nil, for: .allEvents)
      button.gestureRecognizers?.forEach(button.removeGestureRecognizer)
      button.prepareForReuse()
    }
    recycledKeyButtons = keyButtons
    keyButtons.removeAll()
  }

  private func makeButton(for key: String) -> KeyButton {
    let btn = recycledKeyButtons.popLast() ?? KeyButton(frame: .zero, theme: settings.theme)
    btn.accessibilityIdentifier = "hypa-key-\(key)"
    if key == "return" {
      configureReturnKey(btn)
    } else if iconKeys().contains(key) {
      btn.setTitle(nil, for: .normal)
      btn.setImage(iconImage(for: key), for: .normal)
      btn.imageView?.contentMode = .scaleAspectFit
    } else {
      btn.setImage(nil, for: .normal)
      btn.setTitle(title(for: key), for: .normal)
      btn.titleLabel?.font =
        UIFont(name: "HelveticaNeue", size: fontSize(for: key))
        ?? .systemFont(ofSize: fontSize(for: key), weight: .medium)
    }
    btn.subtitleText = boardMode == .numeric ? Self.numericSubtitles[key] : nil
    return btn
  }

  private func cursorContext() -> CursorContext {
    CursorContext.read(from: textDocumentProxy, language: activeKeyboardLanguageCode())
  }

  private func publishPredictionContext() {
    guard settings.predictiveBarEnabled else { return }
    publishPredictionContext(cursorContext())
  }

  private func publishPredictionContext(_ context: CursorContext) {
    guard settings.predictiveBarEnabled else { return }
    guard context.mode.allowsPrediction else {
      predictionOrchestrator.reset()
      currentSuggestions = []
      refreshSuggestions()
      return
    }
    predictionOrchestrator.onContextChanged(context)
  }

  private static let contextRefreshWindow: TimeInterval = 0.016

  private func scheduleContextRefresh() {
    guard !contextRefreshScheduled else { return }
    contextRefreshScheduled = true
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.contextRefreshWindow) { [weak self] in
      guard let self else { return }
      self.contextRefreshScheduled = false
      self.performContextRefresh()
    }
  }

  private func performContextRefresh() {
    keyHost?.refreshHitSlop()
    guard settings.predictiveBarEnabled || pendingWordEnd else {
      if typedTail.isEmpty {
        updateAutoCaps()
      } else {
        updateAutoCaps(before: typedTail)
      }
      applyToolbarTheme()
      return
    }
    let context = cursorContext()
    if pendingWordEnd {
      pendingWordEnd = false
      finishWordEnd(context: context)
    }
    updateAutoCaps(before: context.textBeforeCursor)
    publishPredictionContext(context)
    refreshSuggestions()
    refreshPredictionBarIfNeeded()
    applyToolbarTheme()
  }

  private func onSuggestionsChanged(_ state: SuggestionUiState) {
    currentSuggestions = state.visible ? state.candidates : []
    modelSuggestions = state.visible ? state.modelWords : []
    keyHost?.refreshHitSlop()
    refreshSuggestions()
    refreshPredictionBarIfNeeded()
  }

  private func refreshSuggestions() {
    guard !predictionButtons.isEmpty else { return }
    let slots = currentPredictionSlots()
    let currentShape = slots.map { 
      if case .emoji = $0 { return true }
      return false
    }
    
    if currentShape != displayedPredictionSlotsShape {
      swapToolbar()
      return
    }

    predictionButtons.enumerated().forEach { index, button in
      if index < slots.count, case .word(let entry) = slots[index] {
        button.setTitle(entry.title, for: .normal)
        button.setImage(modelSuggestions.contains(entry.title) ? modelDot : nil, for: .normal)
        button.accessibilityLabel = entry.title.isEmpty ? nil : "Insert \(entry.title)"
        button.isEnabled = !entry.title.isEmpty
      } else {
        button.setTitle("", for: .normal)
        button.setImage(nil, for: .normal)
        button.accessibilityLabel = nil
        button.isEnabled = false
      }
    }
  }

  private func currentPredictionEntries() -> [PredictionEntry] {
    var entries: [PredictionEntry] = []
    if let undoable = correctionLedger.undoable {
      entries.append(PredictionEntry(title: undoable.original, action: .undoAutocorrection))
    }
    entries.append(
      contentsOf: currentSuggestions.map { PredictionEntry(title: $0, action: .insertWord) })

    var seen = Set<String>()
    return
      entries
      .filter { !$0.title.isEmpty && seen.insert($0.title.lowercased()).inserted }
      .prefix(Self.suggestionSlots)
      .map { $0 }
  }

  private func selectPrediction(at index: Int) {
    guard !isMutatingTranslationDocument else { return }
    let slots = currentPredictionSlots()
    guard slots.indices.contains(index) else { return }
    switch slots[index] {
    case .word(let entry):
      playKeyFeedback()
      switch entry.action {
      case .insertWord: insertPrediction(entry.title)
      case .undoAutocorrection: undoLastAutocorrection()
      }
    case .emoji, .empty:
      break
    }
  }

  private func insertEmojiSuggestion(_ emoji: String) {
    guard !isMutatingTranslationDocument else { return }
    discardTranslationUndo()
    let prefix = cursorContext().currentWord
    prefix.forEach { _ in textDocumentProxy.deleteBackward() }
    removeFromLocalTextCache(count: prefix.count)

    let inserted = "\(emoji) "
    textDocumentProxy.insertText(inserted)
    appendToLocalTextCache(inserted)
    
    recentEmojiStore.record(emoji)
    correctionLedger.settle()
    scheduleContextRefresh()
  }

  private func insertPrediction(_ suggestion: String) {
    discardTranslationUndo()
    hasUndoableAutoPeriod = false
    isApplyingKeyboardText = true
    let prefix = cursorContext().currentWord
    prefix.forEach { _ in textDocumentProxy.deleteBackward() }
    removeFromLocalTextCache(count: prefix.count)

    let inserted = "\(suggestion) "
    textDocumentProxy.insertText(inserted)
    appendToLocalTextCache(inserted)
    correctionLedger.settle()
    learnCompletedWord()
    noteTypingForBlockCorrection(inserted.count)
    isApplyingKeyboardText = false
    scheduleContextRefresh()
  }

  private func commitPeriodForDoubleSpace() -> Bool {
    let now = Date().timeIntervalSinceReferenceDate
    let wasDoubleTap = now - lastSpaceCommitTime <= doubleSpacePeriodWindow
    lastSpaceCommitTime = now
    guard wasDoubleTap, !isMutatingTranslationDocument else { return false }

    let context = cursorContext()
    guard allowsProseAssists else { return false }
    let before = context.textBeforeCursor
    guard before.hasSuffix(" "), let preceding = before.dropLast().last,
      preceding.isLetter || preceding.isNumber
    else { return false }

    discardTranslationUndo()
    textDocumentProxy.deleteBackward()
    removeFromLocalTextCache(count: 1)
    textDocumentProxy.insertText(". ")
    appendToLocalTextCache(". ")
    hasUndoableAutoPeriod = true
    lastSpaceCommitTime = 0
    correctionLedger.settle()
    noteTypingForBlockCorrection(1)
    return true
  }

  private func undoAutoPeriod() -> Bool {
    hasUndoableAutoPeriod = false
    let before = String((textDocumentProxy.documentContextBeforeInput ?? "").suffix(2))
    guard before == ". " else { return false }
    textDocumentProxy.deleteBackward()
    removeFromLocalTextCache(count: 1)
    textDocumentProxy.deleteBackward()
    removeFromLocalTextCache(count: 1)
    textDocumentProxy.insertText(" ")
    appendToLocalTextCache(" ")
    return true
  }

  private func insertSpaceWithAutocorrection() {
    discardTranslationUndo()
    hasUndoableAutoPeriod = false
    showModeBarUntilNextTyping = false
    textDocumentProxy.insertText(" ")
    appendToLocalTextCache(" ")
    pendingWordEnd = true
    noteTypingForBlockCorrection(1)
  }

  private func finishWordEnd(context: CursorContext) {
    let typed = context.previousWord
    let canCorrect =
      context.mode.allowsPrediction && !typed.isEmpty && settings.autocorrectEnabled
      && !correctionLedger.isRejected(typed)
    guard canCorrect else {
      correctionLedger.settle()
      learnCompletedWord(context: context)
      return
    }

    let word = fixTwoInitialCaps(completedWord: typed)
    let wordContext = word == typed ? context : cursorContext()

    let previousWord = wordContext.wordBeforePrevious
    let engine = autocorrectEngine
    correctionWorker.async { [weak self] in
      let decision = engine.evaluate(word: word, previousWord: previousWord)
      DispatchQueue.main.async {
        self?.applyWordEnd(decision, word: word, context: wordContext)
      }
    }
  }

  private func applyWordEnd(_ decision: CorrectionDecision, word: String, context: CursorContext) {
    guard !isMutatingTranslationDocument else { return }
    let replacement =
      (decision.action == .autoCorrect ? decision.replacement : nil) ?? modelWordCorrection(word)
    if let replacement, replaceRecentlyTyped("\(word) ", with: "\(replacement) ")
    {
      correctionLedger.recordWordCorrection(original: word, replacement: replacement)
      return
    }
    correctionLedger.settle()
    learnCompletedWord(context: context)
  }

  private func modelWordCorrection(_ word: String) -> String? {
    guard word.count >= 3, !correctionLedger.isRejected(word), !personalVocabulary.contains(word),
      !corpusStore.contains(TextNormalizer.normalize(word))
    else { return nil }
    guard !AutocorrectEngine.hasApostropheEnding(word) else { return nil }
    return predictionOrchestrator.modelCorrection(word)
  }

  private var usesNeuralEngine: Bool {
    settings.predictiveBarEnabled && Self.predictionMode != .localOnly
  }

  private func fixTwoInitialCaps(completedWord word: String) -> String {
    guard allowsProseAssists else { return word }
    guard let fixed = AutoCapMode.twoInitialCapsFix(word, locale: keyboardCaseLocale)
    else { return word }
    let typed = "\(word) "
    let before = String((textDocumentProxy.documentContextBeforeInput ?? "").suffix(typed.count))
    guard before == typed else { return word }
    discardTranslationUndo()
    correctionLedger.settle()
    textDocumentProxy.deleteBackward()
    removeFromLocalTextCache(count: 1)
    for _ in word {
      textDocumentProxy.deleteBackward()
      removeFromLocalTextCache(count: 1)
    }
    textDocumentProxy.insertText("\(fixed) ")
    appendToLocalTextCache("\(fixed) ")
    updateAutoCaps()
    publishPredictionContext()
    return fixed
  }

  private func noteTypingForBlockCorrection(_ count: Int) {
    guard settings.autocorrectEnabled, usesNeuralEngine else { return }
    charsSinceBlockCorrection += count
    if let existing = idleBlockCorrectionTimer, existing.isValid {
      existing.fireDate = Date().addingTimeInterval(Self.idleBlockCorrectionDelay)
      return
    }
    let timer = Timer(timeInterval: Self.idleBlockCorrectionDelay, repeats: false) {
      [weak self] _ in
      self?.maybeCorrectBlock()
    }
    timer.tolerance = 0.2
    RunLoop.main.add(timer, forMode: .common)
    idleBlockCorrectionTimer = timer
  }

  private func maybeCorrectBlock() {
    guard settings.autocorrectEnabled, usesNeuralEngine else { return }
    guard charsSinceBlockCorrection >= Self.blockCorrectionCharInterval else { return }
    guard correctionLedger.undoable == nil else { return }

    let context = cursorContext()
    guard context.mode.allowsPrediction, context.currentWord.isEmpty else { return }

    charsSinceBlockCorrection = 0
    blockCorrector.correct(sentence: CursorContext.sentence(of: context.textBeforeCursor))
  }

  private func applyBlockCorrection(original: String, corrected: String) {
    guard settings.autocorrectEnabled, !isMutatingTranslationDocument else { return }
    let context = cursorContext()
    guard context.currentWord.isEmpty, correctionLedger.undoable == nil,
      CursorContext.sentence(of: context.textBeforeCursor)
        .trimmingCharacters(in: .whitespacesAndNewlines) == original
    else { return }
    let changes = WordDiff.changes(original, corrected)
    let churn = changes.reduce(0) { $0 + $1.from.count + $1.to.count }
    guard !changes.isEmpty, churn <= WordDiff.words(original).count,
      !changes.contains(where: { $0.from.contains(where: correctionLedger.isRejected) }),
      changes.allSatisfy(WordDiff.isSmallFix)
    else { return }
    let before = String((textDocumentProxy.documentContextBeforeInput ?? "")
      .suffix(Self.maxBlockLookbackChars))
    guard let at = before.range(of: original, options: .backwards) else { return }

    let tail = String(before[at.upperBound...])
    let removed = original.count + tail.count
    for _ in 0..<removed { textDocumentProxy.deleteBackward() }
    removeFromLocalTextCache(count: removed)
    let replacement = corrected + tail
    textDocumentProxy.insertText(replacement)
    appendToLocalTextCache(replacement)

    correctionLedger.recordWordCorrection(original: original, replacement: corrected)
    scheduleContextRefresh()
  }

  private func learnCompletedWord() { learnCompletedWord(context: cursorContext()) }

  private func learnCompletedWord(context: CursorContext) {
    guard context.mode.allowsLearning, !context.previousWord.isEmpty else { return }
    personalVocabulary.record(
      previousWord: context.wordBeforePrevious, word: context.previousWord)
  }

  private func replaceRecentlyTyped(_ original: String, with replacement: String) -> Bool {
    let before = (textDocumentProxy.documentContextBeforeInput ?? "")
    guard before.hasSuffix(original) else { return false }
    original.forEach { _ in textDocumentProxy.deleteBackward() }
    removeFromLocalTextCache(count: original.count)
    textDocumentProxy.insertText(replacement)
    appendToLocalTextCache(replacement)
    return true
  }

  private func undoLastAutocorrection() {
    guard let applied = correctionLedger.rejectUndoable() else { return }
    _ = replaceRecentlyTyped("\(applied.replacement) ", with: "\(applied.original) ")
    learnCompletedWord()
    scheduleContextRefresh()
  }

  private let customIcons: [String: String] = [
    "mode-mic": "ic_audio_mic",
    "mode-tts": "ic_mode_audio",
    "mode-languages": "ic_hypa_logo_mark",
    "emoji": "face.smiling",
    "mode-emoji": "face.smiling",
    "mode-settings": "gearshape",
  ]

  private func symCfg(_ pt: CGFloat = 17) -> UIImage.SymbolConfiguration {
    UIImage.SymbolConfiguration(pointSize: pt, weight: .medium)
  }

  private func iconImage(for key: String) -> UIImage? {
    let cfg = symCfg(18)
    switch key {
    case "shift":
      let name = shiftState == .locked ? "capslock.fill" : (isShifted ? "shift.fill" : "shift")
      return UIImage(systemName: name, withConfiguration: cfg)
    case "backspace":
      return UIImage(systemName: "delete.backward", withConfiguration: cfg)
    case "return":
      let c = symCfg(17)
      switch textDocumentProxy.returnKeyType {
      case .search, .go: return UIImage(systemName: "magnifyingglass", withConfiguration: c)
      case .send: return UIImage(systemName: "paperplane.fill", withConfiguration: c)
      case .done: return UIImage(systemName: "checkmark", withConfiguration: c)
      case .next: return UIImage(systemName: "arrow.right", withConfiguration: c)
      default: return UIImage(systemName: "return", withConfiguration: c)
      }
    case "mode-languages":
      if let i = UIImage(named: "ic_hypa_logo_mark") { return i.withRenderingMode(.alwaysTemplate) }
      if let i = UIImage(named: "hypa_icon") { return i.withRenderingMode(.alwaysTemplate) }
      return UIImage(systemName: "sparkles", withConfiguration: cfg)
    case "mode-translate":
      if let i = UIImage(named: "ic_mode_translate") {
        return i.withRenderingMode(.alwaysOriginal)
      }
      return UIImage(systemName: "character.bubble", withConfiguration: cfg)
    case "mode-dictionary":
      if let i = UIImage(named: "hypa_dictionary") {
        return i.withRenderingMode(.alwaysOriginal)
      }
      return UIImage(systemName: "book.closed", withConfiguration: cfg)
    case "mode-clipboard":
      return UIImage(systemName: "doc.on.clipboard", withConfiguration: cfg)
    case "mode-text-editing":
      return UIImage(systemName: "character.cursor.ibeam", withConfiguration: cfg)
    case "mode-more":
      return UIImage(systemName: "ellipsis", withConfiguration: cfg)
    case "alpha":
      return UIImage(systemName: "textformat.abc", withConfiguration: cfg)
    case "symbols":
      return UIImage(systemName: "textformat.123", withConfiguration: cfg)
    default:
      let name = customIcons[key] ?? key
      if let i = UIImage(named: name) { return i.withRenderingMode(.alwaysTemplate) }
      if let i = UIImage(systemName: name, withConfiguration: cfg) { return i }
      return nil
    }
  }

  private func handleKey(_ sender: KeyButton) {
    guard !isMutatingTranslationDocument else { return }
    let key = sender.keyName
    guard !key.isEmpty else { return }
    if pickerSearchActive {
      if key == "space" {
        updatePickerSearchQuery(" ")
      } else if key == "return" {
        closePickerSearch()
      } else if !["alpha", "symbols", "shift", "emoji"].contains(key) {
        let typed = isShifted ? keyboardUppercased(key) : key
        sender.committedText = typed
        updatePickerSearchQuery(typed)
        if isShifted {
          resetShift()
          refreshLetterTitles()
          refreshShiftIcon()
        }
      }
      return
    }
    switch key {
    case "alpha":
      boardMode = .alphabet
      rebuildKeyboard()
    case "symbols", "symbols-basic":
      boardMode = .symbols
      rebuildKeyboard()
    case "symbols-extended":
      boardMode = .symbolsExtended
      rebuildKeyboard()
    case "emoji":
      openEmojiPanel()
      rebuildKeyboard()
    case "return":
      discardTranslationUndo()
      hasUndoableAutoPeriod = false
      textDocumentProxy.insertText("\n")
      appendToLocalTextCache("\n")
      correctionLedger.settle()
      noteTypingForBlockCorrection(1)
    case "space":
      if !commitPeriodForDoubleSpace() { insertSpaceWithAutocorrection() }
      if boardMode.isSymbolBoard {
        boardMode = .alphabet
        rebuildKeyboard()
      }
    case "shift":
      toggleShift()
    case "next":
      cycleKeyboardLanguage()
    default:
      discardTranslationUndo()
      hasUndoableAutoPeriod = false
      showModeBarUntilNextTyping = false
      correctionLedger.settle()
      let wasShifted = isShifted
      let isLetter = key.count == 1 && key.first?.isLetter == true
      let inserted = wasShifted && isLetter ? keyboardUppercased(key) : key
      sender.committedText = inserted
      sender.committedConsumedShiftOnce = isLetter && shiftState == .once
      sender.committedConsumedAutoShift = isLetter && isAutoShifted
      textDocumentProxy.insertText(inserted)
      appendToLocalTextCache(inserted)
      toggleHitSlopOverlayIfTriggered()
      if isLetter && shiftState == .once { shiftState = .off }
      if isLetter { isAutoShifted = false }
      if wasShifted && isLetter {
        refreshLetterTitles()
        refreshShiftIcon()
      }
      noteTypingForBlockCorrection(inserted.count)
    }
    scheduleContextRefresh()
  }

  private func backspaceDown() {
    if pickerSearchActive {
      deletePickerSearchCharacter()
    } else {
      deleteOneCharacter(refreshUI: false)
    }
    scheduleDeleteRepeat()
  }

  private func currentLetterPrior() -> [String: Float] {
    let prefix = TextNormalizer.normalize(cursorContext().currentWord)
    let letters = Set(
      keyButtons.map(\.keyName).filter { $0.count == 1 && $0.first?.isLetter == true })
    let barLetters = currentSuggestions
      .map(TextNormalizer.normalize)
      .filter { $0.count > prefix.count && $0.hasPrefix(prefix) }
      .map { String($0.dropFirst(prefix.count).prefix(1)) }
      .filter { letters.contains($0) }
    let key = prefix + "|" + barLetters.joined()
    if key == letterPriorKey { return letterPrior }
    var counts: [String: Int] = [:]
    for letter in letters {
      let normalized = TextNormalizer.normalize(letter)
      counts[letter] =
        corpusStore.commonWithPrefix(prefix + normalized)
        + 2 * personalVocabulary.countWithPrefix(prefix + normalized)
    }
    let total = counts.values.reduce(0, +)
    guard total > 0 || !barLetters.isEmpty else { return [:] }
    letterPriorKey = key
    letterPrior = counts.mapValues { count in Float(count + 1) / Float(total + letters.count) }
    if !barLetters.isEmpty {
      for letter in letters {
        let bar = Float(barLetters.filter { $0 == letter }.count) / Float(barLetters.count)
        letterPrior[letter] = (1 - Self.tapBarShare) * (letterPrior[letter] ?? 0) + Self.tapBarShare * bar
      }
    }
    return letterPrior
  }

  private func toggleHitSlopOverlayIfTriggered() {
    #if DEBUG
      let trigger = Self.hitSlopDebugTrigger
      guard typedTail.hasSuffix(trigger)
        || (textDocumentProxy.documentContextBeforeInput ?? "").hasSuffix(trigger)
      else { return }
      Self.hitSlopDebugTrigger.forEach { _ in textDocumentProxy.deleteBackward() }
      removeFromLocalTextCache(count: Self.hitSlopDebugTrigger.count)
      showHitSlopOverlay.toggle()
      keyHost?.showsHitSlop = showHitSlopOverlay
    #endif
  }

  private func showKeyPreview(for btn: KeyButton) {
    if utilityKeys().contains(btn.keyName) { return }
    guard let text = btn.titleLabel?.text, !text.isEmpty else { return }

    dismissKeyPreview()
    let label = UILabel()
    label.text = text
    label.textAlignment = .center
    label.textColor = settings.theme.label
    label.font = btn.titleLabel?.font.withSize(max(settings.fontSize + 8, 24))
    label.backgroundColor = settings.theme.toolbar
    label.layer.cornerRadius = 10
    label.layer.masksToBounds = true

    let frame = btn.convert(btn.bounds, to: view)
    let size = max(frame.width, 52)
    label.frame = CGRect(
      x: frame.midX - size / 2,
      y: frame.minY - size - 6,
      width: size,
      height: size)
    view.addSubview(label)
    keyPreviewView = label
  }

  private func dismissKeyPreview() {
    keyPreviewView?.removeFromSuperview()
    keyPreviewView = nil
  }

  private var recentAlternateUnit: (text: String, before: String, after: String, document: UUID)?
  private var alternatePopupView: UIView?
  private var alternatePopupLabels: [UILabel] = []

  private static let symbolAlternates: [String: [String]] = [
    "#": ["#", "+", "=", "%", "^"],
    "-": ["-", "–", "—", "•", "_"],
    "(": ["(", "[", "{", "<"],
    ")": [")", "]", "}", ">"],
    "$": ["$", "¢", "€", "£", "¥", "₩", "₦"],
    "\"": ["\"", "“", "”", "«", "»"],
    "'": ["'", "‘", "’", "`"],
    "+": ["+", "*", "#", ","],
    "€": ["€", "$", "¢", "£", "¥", "₩", "₦"],
    "£": ["£", "$", "¢", "€", "¥", "₩", "₦"],
    "¥": ["¥", "$", "¢", "€", "£", "₩", "₦"],
    "%": ["%", "‰"],
    "=": ["=", "≠", "≈"],
    "<": ["<", "≤", "«"],
    ">": [">", "≥", "»"],
    "0": ["0", "°"],
    ".": [".", "…"],
    "?": ["?", "¿"],
    "!": ["!", "¡"],
    "&": ["&", "§"],
    "[": ["[", "("],
    "]": ["]", ")"],
    "{": ["{", "("],
    "}": ["}", ")"],
  ]

  private func alternates(for key: String, consumedShift: Bool) -> [String] {
    boardMode == .alphabet
      ? KeyboardLanguageCatalog.alternateKeys(
        languageCode: activeKeyboardLanguageCode(), key: key,
        shifted: isShifted || consumedShift, capsLocked: shiftState == .locked)
      : Self.symbolAlternates[key] ?? []
  }

  private func beginKeyHold(_ btn: KeyButton) -> Bool {
    let key = btn.keyName
    guard !key.isEmpty else { return false }
    if key == "." { return true }
    let alternates = alternates(for: key, consumedShift: btn.committedConsumedShiftOnce || btn.committedConsumedAutoShift)
    guard !alternates.isEmpty else { return false }
    showAlternatePopup(for: btn, alternates: alternates)
    return true
  }

  private func endKeyHold(_ btn: KeyButton, at point: CGPoint, cancelled: Bool) {
    if btn.keyName == "." {
      guard !cancelled else { return }
      if contextMode == .email || contextMode == .url {
        insertKeyboardText(".com")
      } else {
        openEmojiPanel()
        rebuildKeyboard()
      }
      return
    }
    guard alternatePopupView != nil else { return }
    let selected = cancelled ? nil : selectedAlternate(at: point)
    hideAlternatePopup()
    if let selected, !selected.isEmpty, selected != btn.committedText {
      replaceCommittedText(btn.committedText, with: selected)
    }
    btn.committedText = nil
  }

  private func rollbackCommittedKey(_ key: KeyButton) {
    guard let committed = key.committedText, !committed.isEmpty else { return }
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    guard before.hasSuffix(committed) else { return }
    committed.forEach { _ in textDocumentProxy.deleteBackward() }
    removeFromLocalTextCache(count: committed.count)
    if key.committedConsumedShiftOnce { shiftState = .once }
    if key.committedConsumedAutoShift { isAutoShifted = true }
    key.committedText = nil
    key.committedConsumedShiftOnce = false
    key.committedConsumedAutoShift = false
    refreshLetterTitles()
    refreshShiftIcon()
    scheduleContextRefresh()
  }

  private struct CursorTrackpad {
    let origin: CGPoint
    var committedColumns = 0
    var committedRows = 0
    let allowsVertical: Bool
  }

  private static let cursorColumnStep: CGFloat = 9
  private static let cursorRowStep: CGFloat = 22
  private static let cursorDeadZone: CGFloat = 6
  private static let cursorMaxRowJumpChars = 200
  private static let cursorSilhouetteAlpha: CGFloat = 0.35
  private static let cursorSilhouetteFade: TimeInterval = 0.12

  private func setKeySilhouette(_ on: Bool) {
    UIView.animate(withDuration: Self.cursorSilhouetteFade) { [weak self] in
      guard let self else { return }
      (self.keyGlassContainer ?? self.keyHost)?.alpha = on ? Self.cursorSilhouetteAlpha : 1
      self.keyButtons.forEach { $0.setContentHidden(on) }
    }
  }

  private func beginCursorTrackpad(at origin: CGPoint, key: KeyButton) -> Bool {
    guard cursorTrackpad == nil, alternatePopupView == nil, !pickerSearchActive,
      !isMutatingTranslationDocument
    else { return false }
    correctionLedger.settle()
    discardTranslationUndo()
    locallyTypedText = ""
    typedTail = ""
    pendingWordEnd = false
    idleBlockCorrectionTimer?.invalidate()
    idleBlockCorrectionTimer = nil
    charsSinceBlockCorrection = 0
    cursorTrackpad = CursorTrackpad(
      origin: origin, allowsVertical: ContextMode.allowsMultiLine(textDocumentProxy))
    key.setPressed(false)
    setKeySilhouette(true)
    return true
  }

  private func updateCursorTrackpad(to point: CGPoint) {
    guard var trackpad = cursorTrackpad else { return }
    let dx = point.x - trackpad.origin.x
    let dy = point.y - trackpad.origin.y
    var moved = false

    if trackpad.allowsVertical {
      let rows =
        abs(dy) < Self.cursorDeadZone ? 0 : Int((dy / Self.cursorRowStep).rounded(.towardZero))
      let down = rows > trackpad.committedRows
      if rows != trackpad.committedRows, let offset = verticalStepOffset(down: down) {
        textDocumentProxy.adjustTextPosition(byCharacterOffset: offset)
        trackpad.committedRows += down ? 1 : -1
        moved = true
      }
    }

    let columns =
      abs(dx) < Self.cursorDeadZone ? 0 : Int((dx / Self.cursorColumnStep).rounded(.towardZero))
    if columns != trackpad.committedColumns {
      textDocumentProxy.adjustTextPosition(
        byCharacterOffset: columns - trackpad.committedColumns)
      trackpad.committedColumns = columns
      moved = true
    }

    cursorTrackpad = trackpad
    if moved, settings.hapticsEnabled {
      keyFeedbackGenerator.impactOccurred(intensity: Self.keyHapticIntensity)
      keyFeedbackGenerator.prepare()
    }
  }

  private func verticalStepOffset(down: Bool) -> Int? {
    let before = Array(textDocumentProxy.documentContextBeforeInput ?? "")
    let after = Array(textDocumentProxy.documentContextAfterInput ?? "")
    let lineStart = before.lastIndex(of: "\n")
    let column = before.count - ((lineStart.map { $0 + 1 }) ?? 0)

    if down {
      guard let lineEnd = after.firstIndex(of: "\n") else { return nil }
      let nextLineEnd = after[(lineEnd + 1)...].firstIndex(of: "\n") ?? after.count
      let landing = min(column, nextLineEnd - lineEnd - 1)
      return min(lineEnd + 1 + landing, Self.cursorMaxRowJumpChars)
    }
    guard let lineStart else { return nil }
    let previousStart = before[..<lineStart].lastIndex(of: "\n").map { $0 + 1 } ?? 0
    let previousLength = lineStart - previousStart
    let landing = min(column, previousLength)
    return -min(column + 1 + previousLength - landing, Self.cursorMaxRowJumpChars)
  }

  private func endCursorTrackpad() {
    guard cursorTrackpad != nil else { return }
    cursorTrackpad = nil
    setKeySilhouette(false)
  }

  private func scheduleDeleteRepeat() {
    deleteRepeatDelayTimer?.invalidate()
    let delayTimer = Timer(timeInterval: 0.35, repeats: false) { [weak self] _ in
      self?.startDeleteRepeat()
    }
    delayTimer.tolerance = 0.02
    RunLoop.main.add(delayTimer, forMode: .common)
    deleteRepeatDelayTimer = delayTimer
  }

  private func startDeleteRepeat() {
    deleteRepeatTimer?.invalidate()
    let timer = Timer(timeInterval: 0.065, repeats: true) { [weak self] _ in
      if self?.pickerSearchActive == true {
        self?.deletePickerSearchCharacter()
      } else {
        self?.deleteOneCharacter(refreshUI: false)
      }
    }
    timer.tolerance = 0.01
    RunLoop.main.add(timer, forMode: .common)
    deleteRepeatTimer = timer
  }

  private func stopDeleteRepeat(refreshUI: Bool) {
    deleteRepeatDelayTimer?.invalidate()
    deleteRepeatDelayTimer = nil
    deleteRepeatTimer?.invalidate()
    deleteRepeatTimer = nil
    guard refreshUI else { return }
    scheduleContextRefresh()
  }

  private func deleteOneCharacter(refreshUI: Bool) {
    guard !isMutatingTranslationDocument else { return }
    discardTranslationUndo()
    let undidPeriod = hasUndoableAutoPeriod && undoAutoPeriod()
    if !undidPeriod {
      if let applied = correctionLedger.rejectUndoable(),
        replaceRecentlyTyped("\(applied.replacement) ", with: "\(applied.original) ")
      {
        learnCompletedWord()
      } else {
        deleteLastGraphemeCluster()
      }
    }
    noteTypingForBlockCorrection(0)
    if refreshUI { scheduleContextRefresh() }
  }

  private func deleteLastGraphemeCluster() {
    let unit = recentAlternateUnit
    recentAlternateUnit = nil
    if let unit, textDocumentProxy.selectedText?.isEmpty != false,
      textDocumentProxy.documentIdentifier == unit.document,
      textDocumentProxy.documentContextBeforeInput == unit.before,
      textDocumentProxy.documentContextAfterInput == unit.after
    {
      for _ in unit.text {
        guard let before = textDocumentProxy.documentContextBeforeInput else { break }
        deleteLastGraphemeCluster()
        guard let after = textDocumentProxy.documentContextBeforeInput,
          Self.sameDocumentTail(after, String(before.dropLast())) else { break }
      }
      return
    }
    if let selected = textDocumentProxy.selectedText, !selected.isEmpty {
      textDocumentProxy.deleteBackward()
      typedTail = ""
      return
    }
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    guard let cluster = before.last else {
      textDocumentProxy.deleteBackward()
      return
    }
    let wanted = String(before.dropLast())
    var steps = max(1, String(cluster).utf16.count)
    while steps > 0 {
      let current = textDocumentProxy.documentContextBeforeInput ?? ""
      if Self.sameDocumentTail(current, wanted) { break }
      textDocumentProxy.deleteBackward()
      steps -= 1
      let next = textDocumentProxy.documentContextBeforeInput ?? ""
      if next == current { break }
    }
    removeFromLocalTextCache(count: 1)
  }

  private static func sameDocumentTail(_ current: String, _ wanted: String) -> Bool {
    if current == wanted { return true }
    let n = min(current.count, wanted.count, 64)
    return n > 0 && current.suffix(n) == wanted.suffix(n) && current.count <= wanted.count
  }

  private func showAlternatePopup(for btn: UIButton, alternates: [String]) {
    hideAlternatePopup()
    let container = UIView()
    container.isUserInteractionEnabled = false
    container.layer.cornerRadius = 10
    container.layer.masksToBounds = true
    let glass = makeGlassBackdrop(tint: settings.theme.toolbar.withAlphaComponent(0.88), cornerRadius: 10)
    if let glass {
      container.addSubview(glass)
    } else {
      container.backgroundColor = settings.theme.toolbar
    }

    let stack = UIStackView()
    stack.axis = .horizontal
    stack.alignment = .fill
    stack.distribution = .fillEqually
    stack.spacing = 3
    stack.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(stack)

    alternatePopupLabels = alternates.map { alternate in
      let label = UILabel()
      label.text = alternate
      label.textAlignment = .center
      label.textColor = settings.theme.label
      let popupFontSize = max(settings.fontSize - 4, 15)
      label.font =
        UIFont(name: "HelveticaNeue", size: popupFontSize)
        ?? .systemFont(ofSize: popupFontSize, weight: .medium)
      label.layer.cornerRadius = 8
      label.layer.masksToBounds = true
      stack.addArrangedSubview(label)
      return label
    }

    let padding: CGFloat = 4
    let itemWidth = keyWidth * 0.88
    let popupWidth = CGFloat(alternates.count) * itemWidth + CGFloat(alternates.count - 1) * 3
      + padding * 2
    let popupHeight = keyHeight * 0.85 + padding * 2
    let x = min(
      max(btn.frame.midX - popupWidth / 2, sideMargin), view.bounds.width - sideMargin - popupWidth)
    let y = max(btn.frame.minY - popupHeight - 8, 4)
    container.frame = CGRect(x: x, y: y, width: popupWidth, height: popupHeight)
    glass?.frame = container.bounds
    view.addSubview(container)
    alternatePopupView = container

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: container.topAnchor, constant: padding),
      stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: padding),
      stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -padding),
      stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -padding),
    ])
    highlightAlternate(at: CGPoint(x: btn.frame.midX, y: container.frame.midY))
    container.transform = CGAffineTransform(scaleX: 0.92, y: 0.92)
    UIView.animate(withDuration: 0.1) { container.transform = .identity }
  }

  private func hideAlternatePopup() {
    alternatePopupView?.removeFromSuperview()
    alternatePopupView = nil
    alternatePopupLabels.removeAll()
  }

  private func highlightAlternate(at point: CGPoint) {
    let selected = labelForAlternate(at: point) ?? alternatePopupLabels.first
    for label in alternatePopupLabels {
      label.backgroundColor = label === selected ? settings.theme.accent : .clear
      label.textColor = label === selected ? .white : settings.theme.label
    }
  }

  private func selectedAlternate(at point: CGPoint) -> String? {
    let label = labelForAlternate(at: point) ?? alternatePopupLabels.first
    return label?.text
  }

  private func labelForAlternate(at point: CGPoint) -> UILabel? {
    alternatePopupLabels.first { label in
      label.convert(label.bounds, to: view).contains(point)
    }
  }

  private func replaceCommittedText(_ previous: String?, with replacement: String) {
    if !pickerSearchActive, let previous {
      guard textDocumentProxy.selectedText?.isEmpty != false,
        textDocumentProxy.documentContextBeforeInput?.hasSuffix(previous) == true else { return }
    }
    if let previous, !previous.isEmpty {
      if pickerSearchActive {
        previous.forEach { _ in deletePickerSearchCharacter() }
      } else {
        previous.forEach { _ in textDocumentProxy.deleteBackward() }
        removeFromLocalTextCache(count: previous.count)
      }
    }
    insertKeyboardText(replacement)
    if !pickerSearchActive, replacement.count > 1,
      let before = textDocumentProxy.documentContextBeforeInput,
      let after = textDocumentProxy.documentContextAfterInput,
      before.hasSuffix(replacement)
    {
      recentAlternateUnit = (replacement, before, after, textDocumentProxy.documentIdentifier)
    }
  }

  private func insertKeyboardText(_ text: String) {
    recentAlternateUnit = nil
    let text = text.precomposedStringWithCanonicalMapping
    guard !isMutatingTranslationDocument else { return }
    if pickerSearchActive {
      updatePickerSearchQuery(text)
      if isShifted {
        resetShift()
        refreshLetterTitles()
        refreshShiftIcon()
      }
      playKeyFeedback()
      return
    }

    discardTranslationUndo()
    hasUndoableAutoPeriod = false
    correctionLedger.settle()
    let wasShifted = isShifted
    let isLetter = !text.isEmpty && text.allSatisfy(\.isLetter)
    textDocumentProxy.insertText(text)
    appendToLocalTextCache(text)
    if isLetter && shiftState == .once { shiftState = .off }
    if isLetter { isAutoShifted = false }
    if wasShifted && isLetter {
      refreshLetterTitles()
      refreshShiftIcon()
    }
    noteTypingForBlockCorrection(text.count)
    scheduleContextRefresh()
    playKeyFeedback()
  }

  private func openEmojiPanel() {
    emojiRepository.warmup { [weak self] in
      guard let self, self.featureMode == .emoji else { return }
      self.rebuildKeyboard()
    }
    featureMode = .emoji
  }

  private func makeEmojiPanel() -> UIView {
    EmojiPanelView(
      theme: settings.theme,
      repository: emojiRepository,
      recentStore: recentEmojiStore,
      initialCategoryIndex: emojiCategoryIndex,
      onPick: { [weak self] sequence in self?.insertEmoji(sequence) },
      onSearch: { [weak self] in self?.beginPickerSearch(.emoji, returnMode: .emoji) },
      onClose: { [weak self] in
        self?.featureMode = .keyboard
        self?.rebuildKeyboard()
      },
      onDeleteDown: { [weak self] in
        guard let self else { return }
        self.playKeyFeedback()
        self.deleteOneCharacter(refreshUI: false)
        self.scheduleDeleteRepeat()
      },
      onDeleteUp: { [weak self] in self?.stopDeleteRepeat(refreshUI: true) })
  }

  private func insertEmoji(_ sequence: String) {
    guard !isMutatingTranslationDocument else { return }
    discardTranslationUndo()
    correctionLedger.settle()

    if pickerSearchScope == .emoji {
      expectedEmojiSearchDocument = emojiSearchDocumentState.inserting(sequence)
    }
    isApplyingKeyboardText = true
    defer { isApplyingKeyboardText = false }

    textDocumentProxy.insertText(sequence)
    appendToLocalTextCache(sequence)
    noteTypingForBlockCorrection(sequence.count)
    scheduleContextRefresh()
    playKeyFeedback()
  }

  private func refreshLetterTitles() {
    guard appliedLetterCaseIsShifted != isShifted else { return }
    appliedLetterCaseIsShifted = isShifted
    guard boardMode == .alphabet else { return }
    for (key, btn) in buttonByKey where !utilityKeys().contains(key) && !iconKeys().contains(key) {
      btn.setTitle(isShifted ? keyboardUppercased(key) : key, for: .normal)
    }
  }
  private func refreshReturnKeyIfNeeded() {
    let type = textDocumentProxy.returnKeyType ?? .default
    guard type != appliedReturnKeyType else { return }
    appliedReturnKeyType = type
    if let button = buttonByKey["return"] { configureReturnKey(button) }
  }

  private func configureReturnKey(_ button: UIButton) {
    let title: String?
    switch textDocumentProxy.returnKeyType {
    case .join: title = "Join"
    case .continue: title = "Continue"
    case .emergencyCall: title = "Emergency"
    default: title = nil
    }
    button.setTitle(title, for: .normal)
    button.setImage(title == nil ? iconImage(for: "return") : nil, for: .normal)
    button.titleLabel?.font = .systemFont(ofSize: max(settings.fontSize - 2, 11), weight: .semibold)
  }

  private func refreshShiftIcon() {
    guard let btn = buttonByKey["shift"] else { return }
    btn.setImage(iconImage(for: "shift"), for: .normal)
  }

  private func refreshIcons() {
    for key in iconKeys() {
      guard let btn = buttonByKey[key] else { continue }
      if key == "return" {
        configureReturnKey(btn)
      } else {
        btn.setTitle(nil, for: .normal)
        btn.setImage(iconImage(for: key), for: .normal)
      }
      btn.tintColor = (key == "return") ? .white : settings.theme.label
    }
  }

  private func applyTheme() {
    view.backgroundColor = .clear
    heightConstraint?.constant = desiredKeyboardHeight()
    keyButtons.forEach { applyTheme(to: $0) }
    applyToolbarTheme()
    refreshLetterTitles()
    refreshIcons()
  }

  private func applyTheme(to button: UIButton) {
    guard let key = (button as? KeyButton)?.keyName, !key.isEmpty else { return }
    if let kb = button as? KeyButton {
      kb.applyTheme(
        settings.theme, isUtility: utilityKeys().contains(key) && key != "return",
        isAccent: key == "return")
    }
    if !iconKeys().contains(key) {
      button.titleLabel?.font =
        UIFont(name: "HelveticaNeue", size: fontSize(for: key))
        ?? .systemFont(ofSize: fontSize(for: key), weight: .medium)
    }
    button.layer.masksToBounds = false
  }

  private func applyToolbarTheme() {
    for (key, container) in toolbarIconViews {
      let isActive =
        (key == "mode-translate" && featureMode == .translate)
        || (key == "mode-dictionary"
          && (featureMode == .dictionary || featureMode == .dictionaryLanguagePicker
            || featureMode == .dictionaryResult))
        || (key == "mode-mic"
          && (featureMode == .stt || isSttListening || isSttStarting || isSttProcessing))
        || (key == "mode-tts"
          && (featureMode == .tts || isTtsPlaying || isTtsLoading || ttsAudioData != nil))
        || (key == "mode-clipboard" && featureMode == .clipboard)
        || (key == "mode-text-editing" && featureMode == .textEditing)
        || (key == "mode-more" && isToolsPanelOpen)
        || (key == "mode-languages" && featureMode == .keyboardLanguagePicker)
      container.applyBackground(isActive ? settings.theme.accent : settings.theme.toolbar)
      container.alpha = 1
      container.imageView.tintColor = isActive ? .white : settings.theme.label
      container.setLoading(key == "mode-tts" && isTtsLoading, tintColor: settings.theme.label)
    }
  }

  private func title(for key: String) -> String {
    switch key {
    case "space": return keyboardSpaceLabel()
    case "symbols", "symbols-basic": return "123"
    case "symbols-extended": return "#+="
    case "alpha": return "ABC"
    default: return key
    }
  }

  private func keyboardSpaceLabel() -> String {
    let name = activeKeyboardLanguageName()
    return isAutoDetectLanguage(name) ? "Hypa English" : "Hypa \(name)"
  }

  private static let iconKeySet: Set<String> = [
    "shift", "backspace", "return", "alpha", "symbols", "emoji",
  ]
  private static let commitOnTouchUpKeys: Set<String> = [
    "alpha", "symbols", "symbols-basic", "symbols-extended", "emoji", "space", ".",
  ]
  private func commitsOnTouchUp(_ key: String) -> Bool {
    Self.commitOnTouchUpKeys.contains(key)
      || (boardMode.isSymbolBoard && !utilityKeys().contains(key))
  }
  private static let utilityKeySet: Set<String> = [
    "shift", "backspace", "symbols", "symbols-basic", "symbols-extended", "alpha",
    "space", "emoji", "return",
  ]
  private func iconKeys() -> Set<String> { Self.iconKeySet }
  private func utilityKeys() -> Set<String> { Self.utilityKeySet }
  private func fontSize(for key: String) -> CGFloat {
    if key == "space" { return settings.fontSize }
    guard key.count == 1 else { return max(settings.fontSize - 3, 10) }
    return boardMode == .numeric ? settings.fontSize + 5 : settings.fontSize
  }

  private func layoutKeyboard() {
    if let fp = fullPanelView {
      fp.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: desiredKeyboardHeight())
      fp.setNeedsLayout()
      fp.layoutIfNeeded()
      return
    }
    if let keyHost {
      keyHost.frame = CGRect(
        x: 0, y: 0, width: view.bounds.width,
        height: max(view.bounds.height, desiredKeyboardHeight()))
      keyGlassContainer?.frame = keyHost.bounds
    }
    keyWidth = (view.bounds.width - 2 * sideMargin - 9 * keyGap) / 10
    layoutModeBar()
    if let search = pickerSearchView {
      search.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: modeBarHeight)
    }
    layoutFeatureHeaders()
    if let panel = boardPanelView {
      let top = keyboardRowsTop()
      panel.frame = CGRect(
        x: 0, y: top, width: view.bounds.width, height: desiredKeyboardHeight() - top)
      return
    }
    layoutKeyRows()
    layoutThirdRowKeys()
    layoutBottomRowKeys()
    expandTouchTargets()
  }

  private func expandTouchTargets() {
    let visuals = keyButtons.filter { !$0.keyName.isEmpty && !$0.frame.isEmpty }
      .map { (key: $0, frame: $0.frame) }
    guard !visuals.isEmpty else { return }
    let board = CGRect(
      x: 0, y: modeBarHeight, width: view.bounds.width,
      height: max(0, desiredKeyboardHeight() - modeBarHeight))
    for entry in visuals {
      let frame = entry.frame
      let row = visuals.filter { abs($0.frame.midY - frame.midY) < frame.height / 2 }
      let left =
        row.contains { $0.frame.maxX <= frame.minX + 0.5 }
        ? keyGap / 2 : max(keyGap / 2, frame.minX - board.minX)
      let right =
        row.contains { $0.frame.minX >= frame.maxX - 0.5 }
        ? keyGap / 2 : max(keyGap / 2, board.maxX - frame.maxX)
      let above = visuals.contains { $0.frame.maxY <= frame.minY + 0.5 }
      let below = visuals.contains { $0.frame.minY >= frame.maxY - 0.5 }
      let top = above ? rowSpacing / 2 : max(rowSpacing / 2, frame.minY - board.minY)
      let bottom = below ? rowSpacing / 2 : max(rowSpacing / 2, board.maxY - frame.maxY)
      entry.key.frame = CGRect(
        x: frame.minX - left, y: frame.minY - top,
        width: frame.width + left + right, height: frame.height + top + bottom)
      entry.key.visualInsets = UIEdgeInsets(
        top: top + keyVisualInsetY, left: left + keyVisualInsetX,
        bottom: bottom + keyVisualInsetY, right: right + keyVisualInsetX)
    }
  }

  private func layoutModeBar() {
    modeBar?.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: modeBarHeight)
  }

  private func layoutFeatureHeaders() {
    [translateHeaderView, dictionaryHeaderView].forEach {
      $0?.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: modeBarHeight)
    }
  }

  private func keyboardRowsTop() -> CGFloat { topPadding }
  private func desiredKeyboardHeight() -> CGFloat {
    keyboardRowsTop() + keyAreaHeight
  }

  private func setKeyFrame(_ key: String, _ frame: CGRect) {
    guard let button = buttonByKey[key] else { return }
    let scale = traitCollection.displayScale
    let left = pixelSnap(frame.minX, scale: scale)
    let right = pixelSnap(frame.maxX, scale: scale)
    let top = pixelSnap(frame.minY, scale: scale)
    let bottom = pixelSnap(frame.maxY, scale: scale)
    button.frame = CGRect(x: left, y: top, width: right - left, height: bottom - top)
  }

  private func layoutKeyRows() {
    let w = view.bounds.width
    var y = keyboardRowsTop()
    for row in currentRows {
      let n = CGFloat(row.count)
      let fill = (w - 2 * sideMargin - (n - 1) * keyGap) / n
      let isSymbolPunctuation = boardMode.isSymbolBoard && row == symbolPunctuationKeys
      let edge = keyWidth + utilityKeyExtraWidth
      let symbolFill = (w - 2 * sideMargin - 2 * edge - (n + 1) * keyGap) / n
      let rowKeyWidth =
        boardMode == .numeric
        ? fill : (isSymbolPunctuation ? symbolFill : min(keyWidth, fill))
      let rowW = n * rowKeyWidth + (n - 1) * keyGap
      var x = (w - rowW) / 2
      for key in row {
        setKeyFrame(key, CGRect(x: x, y: y, width: rowKeyWidth, height: keyHeight))
        x += rowKeyWidth + keyGap
      }
      y += keyHeight + rowSpacing
    }
  }

  private func layoutThirdRowKeys() {
    guard boardMode != .numeric, currentRows.count >= 3 else { return }
    let edges = thirdRowEdgeKeys()
    guard let leftKey = edges.first, let rightKey = edges.last else { return }
    let w = view.bounds.width
    let top = keyboardRowsTop() + (keyHeight + rowSpacing) * 2
    let leftWidth: CGFloat
    let rightWidth: CGFloat
    if boardMode.isSymbolBoard {
      leftWidth = keyWidth + utilityKeyExtraWidth
      rightWidth = leftWidth
    } else {
      guard let firstLetter = currentRows[2].first.flatMap({ buttonByKey[$0] }),
        let lastLetter = currentRows[2].last.flatMap({ buttonByKey[$0] })
      else { return }
      leftWidth = firstLetter.frame.minX - keyGap - sideMargin
      rightWidth = w - sideMargin - keyGap - lastLetter.frame.maxX
    }
    setKeyFrame(leftKey, CGRect(x: sideMargin, y: top, width: leftWidth, height: shiftHeight))
    setKeyFrame(
      rightKey,
      CGRect(x: w - sideMargin - rightWidth, y: top, width: rightWidth, height: shiftHeight))
  }

  private func layoutBottomRowKeys() {
    guard boardMode != .numeric else { return }
    let w = view.bounds.width
    let g = keyGap
    let top = keyboardRowsTop() + (keyHeight + rowSpacing) * 3
    let sw = keyWidth + utilityKeyExtraWidth
    let keys = bottomRowKeys()
    let width: (String) -> CGFloat = { key in
      switch key {
      case "space": return 0
      case "return": return self.returnWidth
      default: return sw
      }
    }
    let fixed = keys.reduce(CGFloat.zero) { $0 + width($1) }
    spaceWidth = w - 2 * sideMargin - fixed - g * CGFloat(keys.count - 1)
    var x = sideMargin
    for key in keys {
      let keyWidth = key == "space" ? spaceWidth : width(key)
      setKeyFrame(key, CGRect(x: x, y: top, width: keyWidth, height: spaceHeight))
      x += keyWidth + g
    }
  }

  private func triggerTranslate(preferredSource: String? = nil) {
    guard !isTranslating, !isRestoringTranslation else { return }
    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard hasFullAccess else {
      showToolbarError(.translate, KeyboardErrorCatalog.fullAccessNeeded)
      return
    }
    isTranslating = true
    translationMutationGeneration += 1
    thinkingRequestGeneration += 1
    latestTranslationThinking = nil
    lastExplainableTranslation = nil
    isTranslationThinkingLoading = false
    thinkingTask?.cancel()
    let generation = translationMutationGeneration
    updateUI()

    let trimmedPreferred = preferredSource?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let trimmedPreferred, !trimmedPreferred.isEmpty {
      sendTranslateRequest(src: trimmedPreferred, token: token, generation: generation)
      return
    }

    readFullDocumentText(
      isCancelled: { [weak self] in
        self?.isCurrentTranslationGeneration(generation) != true
      },
      completion: { [weak self] fullText, _ in
        guard let self else { return }
        guard self.isCurrentTranslationGeneration(generation) else { return }
        let src = fullText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !src.isEmpty else {
          self.finishTranslationRequest(generation: generation) {
            self.showToolbarError(.translate, KeyboardErrorCatalog.typeOrSelectText)
          }
          return
        }
        self.sendTranslateRequest(src: src, token: token, generation: generation)
      })
  }

  private func sendTranslateRequest(src: String, token: String, generation: Int) {
    guard isCurrentTranslationGeneration(generation) else { return }
    guard let url = apiURL("/v2/translate/mt") else {
      finishTranslationRequest(generation: generation) {
        self.showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
      }
      return
    }
    lastSentTranslationSourceText = src
    let requestId = "keyboard-ios-\(Int(Date().timeIntervalSince1970 * 1000))"
    let serviceModel = KeyboardLanguageCatalog.resolveTranslation(
      selectedProvider: settings.translationProvider, selectedModel: settings.translationModel)
    var payload: [String: Any] = [
      "text": src,
      "provider": serviceModel.provider,
      "model": serviceModel.model,
      "stream": false, "target_lang": targetLanguageName,
      "temperature": 0.8, "top_p": 0.95, "top_k": 50,
      "max_tokens": 3000, "thinking": false, "client_request_id": requestId,
    ]
    if !isAutoDetectLanguage(sourceLanguageName) {
      payload["source_lang"] = sourceLanguageName
    }
    devLog(
      "[MT] ▶ id=%@ src=%@ tgt=%@ model=%@ text=%@", requestId, sourceLanguageName,
      targetLanguageName, settings.translationModel, String(src.prefix(80))
    )
    devLog("[MT] URL=%@ token=present", url.absoluteString)
    guard
      let req = makeAuthorizedPostRequest(
        url: url, token: token, payload: payload, timeout: 30,
        accept: "text/plain; charset=utf-8, application/json; charset=utf-8")
    else {
      finishTranslationRequest(generation: generation) {
        self.showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
      }
      return
    }
    translationTask = URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard self.isCurrentTranslationGeneration(generation) else { return }
        if let error {
          self.finishTranslationRequest(generation: generation) {
            let message = KeyboardErrorCatalog.network(error)
            self.showToolbarError(.translate, message)
            devLog("[MT] ✗ %@ (%ld)", error.localizedDescription, (error as NSError).code)
          }
          return
        }
        if let errMsg = self.checkHttpError(response: response, data: data, context: "MT") {
          self.finishTranslationRequest(generation: generation) {
            self.showToolbarError(.translate, errMsg)
          }
          return
        }
        guard let data, let bodyStr = String(data: data, encoding: .utf8) else {
          self.finishTranslationRequest(generation: generation) {
            self.showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
          }
          return
        }
        do {
          let payload = try self.extractTranslatedText(from: bodyStr)
          if self.isInvalidGeneratedText(payload.translatedText) {
            self.finishTranslationRequest(generation: generation) {
              self.showToolbarError(.translate, KeyboardErrorCatalog.noTranslation)
            }
            return
          }
          self.latestTranslationThinking = payload.thinkingText
          self.applyDetectedSourceLanguage(payload.detectedLanguage)
          let translatedText = payload.translatedText
          self.lastExplainableTranslation = ExplainableTranslation(
            sourceText: src,
            translatedText: translatedText,
            sourceLang: self.sourceLanguageName,
            targetLang: self.targetLanguageName,
            requestId: requestId)
          if let selected = self.makeSelectionTranslationState(translatedText) {
            guard self.isCurrentTranslationGeneration(generation) else { return }
            self.applyTranslatedText(translatedText, generation: generation) { [weak self] in
              self?.armTranslationUndo(selected, generation: generation)
            }
          } else {
            self.readFullDocumentText(
              isCancelled: { [weak self] in
                self?.isCurrentTranslationGeneration(generation) != true
              },
              completion: { [weak self] originalDocument, _ in
                guard let self else { return }
                guard self.isCurrentTranslationGeneration(generation) else { return }
                self.applyTranslatedText(translatedText, generation: generation) {
                  self.armTranslationUndo(
                    LastTranslationState(
                      translatedText: translatedText,
                      scope: .document(expected: translatedText, original: originalDocument)),
                    generation: generation)
                }
              })
          }
        } catch {
          self.finishTranslationRequest(generation: generation) {
            self.showToolbarError(.translate, self.translationParseErrorMessage(error))
          }
        }
      }
    }
    translationTask?.resume()
  }

  private func isAutoDetectLanguage(_ value: String) -> Bool {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "-", with: " ")
      .replacingOccurrences(of: "_", with: " ")
      .lowercased()
    return normalized.isEmpty
      || normalized == "auto"
      || normalized == "auto detect"
      || normalized == "auto detected"
      || normalized == "autodetect"
  }

  private func resolveDetectedSourceLanguage(
    _ detected: String, in languages: [TranslationLanguage]
  ) -> TranslationLanguage? {
    let trimmed = detected.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || isAutoDetectLanguage(trimmed) { return nil }
    let supported = languages.filter { !isAutoDetectLanguage($0.name) }
    if let exact = supported.first(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame })
    {
      return exact
    }
    let lowered = trimmed.lowercased()
    return supported
      .filter { lowered.hasPrefix($0.name.lowercased()) }
      .max(by: { $0.name.count < $1.name.count })
  }

  private func applyDetectedSourceLanguage(_ detected: String?) {
    guard isAutoDetectLanguage(sourceLanguageName) || isAutoDetectLanguage(sourceLanguageCode)
    else { return }
    guard let detected, let language = resolveDetectedSourceLanguage(detected, in: supportedSourceLanguages)
    else { return }
    guard !isAutoDetectLanguage(language.name) else { return }
    sourceLanguageCode = language.code
    sourceLanguageName = language.name
    saveSharedLanguageSettings(
      translateSourceLanguage: sourceLanguageName, translateTargetLanguage: targetLanguageName)
  }

  private func openTranslationThinking() {
    featureMode = .thinkingView
    rebuildKeyboard()
    requestTranslationThinkingIfNeeded()
  }

  private func requestTranslationThinkingIfNeeded() {
    if latestTranslationThinking?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
      return
    }
    guard supportsTranslationThinking, let pair = lastExplainableTranslation else { return }
    guard !isTranslationThinkingLoading else { return }
    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = apiURL("/v2/translate/mt/thinking") else {
      showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
      return
    }
    thinkingRequestGeneration += 1
    let generation = thinkingRequestGeneration
    isTranslationThinkingLoading = true
    if featureMode == .thinkingView { updateUI() }
    let serviceModel = KeyboardLanguageCatalog.resolveTranslation(
      selectedProvider: settings.translationProvider, selectedModel: settings.translationModel)
    let payload: [String: Any] = [
      "provider": serviceModel.provider,
      "model": serviceModel.model,
      "source_lang": pair.sourceLang,
      "target_lang": pair.targetLang,
      "source_text": pair.sourceText,
      "target_text": pair.translatedText,
      "stream": false,
      "temperature": 0.3,
      "top_p": 0.5,
      "top_k": 1,
      "max_tokens": 800,
      "client_request_id": pair.requestId,
    ]
    guard
      let req = makeAuthorizedPostRequest(
        url: url, token: token, payload: payload, timeout: 30)
    else {
      isTranslationThinkingLoading = false
      showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
      return
    }
    thinkingTask = URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard generation == self.thinkingRequestGeneration else { return }
        self.isTranslationThinkingLoading = false
        if let error {
          self.showToolbarError(.translate, KeyboardErrorCatalog.network(error))
          if self.featureMode == .thinkingView { self.updateUI() }
          return
        }
        if let errMsg = self.checkHttpError(response: response, data: data, context: "MT-thinking")
        {
          self.showToolbarError(.translate, errMsg)
          if self.featureMode == .thinkingView { self.updateUI() }
          return
        }
        guard let data, let bodyStr = String(data: data, encoding: .utf8),
          let thinking = self.extractThinkingText(from: bodyStr),
          !thinking.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
          self.showToolbarError(.translate, KeyboardErrorCatalog.tryAgain)
          if self.featureMode == .thinkingView { self.updateUI() }
          return
        }
        self.latestTranslationThinking = thinking
        if self.featureMode == .thinkingView { self.updateUI() }
      }
    }
    thinkingTask?.resume()
  }

  private func canSwapTranslateLanguages() -> Bool {
    if isAutoDetectLanguage(sourceLanguageName) || isAutoDetectLanguage(sourceLanguageCode) {
      return false
    }
    if isAutoDetectLanguage(targetLanguageName) || isAutoDetectLanguage(targetLanguageCode) {
      return false
    }
    if sourceLanguageCode.caseInsensitiveCompare(targetLanguageCode) == .orderedSame {
      return false
    }
    if sourceLanguageName.caseInsensitiveCompare(targetLanguageName) == .orderedSame {
      return false
    }
    return true
  }

  private func makeSelectionTranslationState(_ translatedText: String) -> LastTranslationState? {
    let context = limitedTextContext()
    guard !context.selected.isEmpty else { return nil }
    let expectedBefore = String((context.before + translatedText).suffix(contextBeforeLimit))
    return LastTranslationState(
      translatedText: translatedText,
      scope: .selection(
        expectedBefore: expectedBefore, expectedAfter: context.after, original: context.selected))
  }

  private func applyTranslatedText(
    _ text: String, generation: Int, completion: @escaping () -> Void = {}
  ) {
    guard isCurrentTranslationGeneration(generation) else { return }
    if let sel = textDocumentProxy.selectedText, !sel.isEmpty {
      isMutatingTranslationDocument = true
      textDocumentProxy.insertText(text)
      setLocalTextCache(text)
      completion()
      return
    }
    deleteEntireDocument(
      isCancelled: { [weak self] in
        self?.isCurrentTranslationGeneration(generation) != true
      },
      completion: { [weak self] in
        guard let self else { return }
        self.textDocumentProxy.insertText(text)
        self.setLocalTextCache(text)
        completion()
      })
  }

  private func clearTranslationThinkingState() {
    thinkingRequestGeneration += 1
    thinkingTask?.cancel()
    thinkingTask = nil
    isTranslationThinkingLoading = false
    latestTranslationThinking = nil
    lastExplainableTranslation = nil
    lastSentTranslationSourceText = nil
  }

  private func discardTranslationUndo(refreshUI: Bool = true) {
    guard !isMutatingTranslationDocument else { return }
    let hadUndo = lastTranslationState != nil
    let wasTranslating = isTranslating
    let wasRestoring = isRestoringTranslation
    if hadUndo || wasTranslating || wasRestoring {
      translationMutationGeneration += 1
    }
    lastTranslationState = nil
    clearTranslationThinkingState()
    isRestoringTranslation = false
    isMutatingTranslationDocument = false
    isTraversingDocument = false
    if wasTranslating {
      isTranslating = false
      translationTask?.cancel()
    }
    if refreshUI && (hadUndo || wasTranslating || wasRestoring) {
      refreshTranslateActionAppearance()
    }
  }

  private func refreshTranslateActionAppearance() {
    guard featureMode == .translate, pickerSearchActive == false else { return }
    updateUI()
  }

  private func suppressTranslationUndoHostSync() {
    suppressTranslationUndoHostSyncUntil = Date().timeIntervalSince1970 + 0.5
  }

  private func isCurrentTranslationGeneration(_ generation: Int) -> Bool {
    generation == translationMutationGeneration
  }

  private func finishTranslationRequest(generation: Int, then body: () -> Void = {}) {
    guard isCurrentTranslationGeneration(generation) else { return }
    isTranslating = false
    isMutatingTranslationDocument = false
    isTraversingDocument = false
    body()
    updateUI()
  }

  private func armTranslationUndo(_ state: LastTranslationState, generation: Int) {
    guard isCurrentTranslationGeneration(generation) else { return }
    isTranslating = false
    isMutatingTranslationDocument = false
    isTraversingDocument = false
    lastTranslationState = state
    suppressTranslationUndoHostSync()
    updateUI()

    if settings.autoSpeakTranslationsKeyboard {
      let textToSpeak = state.translatedText.trimmingCharacters(in: .whitespacesAndNewlines)
      if !textToSpeak.isEmpty {
        startTts(
          overrideText: textToSpeak, overrideLanguageName: targetLanguageName, restart: true)
      }
    }
  }

  private func undoTranslation() {
    guard !isTranslating, !isRestoringTranslation, let state = lastTranslationState else { return }
    isRestoringTranslation = true
    translationMutationGeneration += 1
    let generation = translationMutationGeneration
    lastTranslationState = nil
    clearTranslationThinkingState()
    refreshTranslateActionAppearance()

    switch state.scope {
    case .selection(let expectedBefore, let expectedAfter, let original):
      let context = limitedTextContext()
      guard isCurrentTranslationGeneration(generation),
        context.selected.isEmpty,
        context.before == expectedBefore,
        context.after == expectedAfter
      else {
        finishTranslationRestore(generation: generation)
        return
      }
      isMutatingTranslationDocument = true
      for _ in state.translatedText { textDocumentProxy.deleteBackward() }
      textDocumentProxy.insertText(original)
      setLocalTextCache(original)
      finishTranslationRestore(generation: generation)

    case .document(let expected, let original):
      readFullDocumentText(
        isCancelled: { [weak self] in
          self?.isCurrentTranslationGeneration(generation) != true
        },
        completion: { [weak self] currentDocument, _ in
          guard let self else { return }
          guard self.isCurrentTranslationGeneration(generation) else { return }
          guard currentDocument == expected else {
            self.finishTranslationRestore(generation: generation)
            return
          }
          self.deleteEntireDocument(
            isCancelled: { [weak self] in
              self?.isCurrentTranslationGeneration(generation) != true
            },
            completion: {
              self.textDocumentProxy.insertText(original)
              self.setLocalTextCache(original)
              self.finishTranslationRestore(generation: generation)
            })
        })
    }
  }

  private func finishTranslationRestore(generation: Int) {
    guard isCurrentTranslationGeneration(generation) else { return }
    isRestoringTranslation = false
    isMutatingTranslationDocument = false
    isTraversingDocument = false
    refreshTranslateActionAppearance()
  }

  private func setLocalTextCache(_ text: String) {
    locallyTypedText =
      text.count > localTextCacheLimit ? String(text.suffix(localTextCacheLimit)) : text
  }

  private func appendToLocalTextCache(_ text: String) {
    guard !text.isEmpty else { return }
    locallyTypedText.append(text)
    if locallyTypedText.utf8.count > localTextCacheLimit,
      locallyTypedText.count > localTextCacheLimit
    {
      locallyTypedText = String(locallyTypedText.suffix(localTextCacheLimit))
    }
    typedTail = String((typedTail + text).suffix(Self.typedTailLimit))
  }

  private func removeFromLocalTextCache(count: Int) {
    typedTail = ""
    guard count > 0, !locallyTypedText.isEmpty else { return }
    let removalCount = min(count, locallyTypedText.count)
    locallyTypedText.removeLast(removalCount)
  }

  private func swapTranslateLanguages(rebuildUI: Bool = true) {
    guard canSwapTranslateLanguages() else { return }

    swap(&sourceLanguageCode, &targetLanguageCode)
    swap(&sourceLanguageName, &targetLanguageName)

    if isAutoDetectLanguage(targetLanguageName) || isAutoDetectLanguage(targetLanguageCode) {
      let fallback =
        supportedTargetLanguages.first(where: {
          $0.code.caseInsensitiveCompare(sourceLanguageCode) != .orderedSame
        }) ?? KeyboardLanguageCatalog.defaultTargetLanguage
      targetLanguageCode = fallback.code
      targetLanguageName = fallback.name
    }

    saveSharedLanguageSettings(
      translateSourceLanguage: sourceLanguageName,
      translateTargetLanguage: targetLanguageName
    )
    discardTranslationUndo(refreshUI: false)
    if rebuildUI {
      rebuildKeyboard()
    }
  }

  private func detectedLanguageObject(from json: [String: Any]) -> [String: Any]? {
    if let data = json["data"] as? [String: Any] { return data }
    if let raw = json["data"] as? String,
      let parsed = raw.data(using: .utf8).flatMap({
        try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
      })
    {
      return parsed
    }
    return nil
  }

  private func detectedLanguage(from json: [String: Any], data: [String: Any]?) -> String? {
    let keys = [
      "detected_source_lang", "detectedSourceLanguage", "source_language_detected",
      "language", "source_language", "detected_language",
    ]
    for record in [json, data].compactMap({ $0 }) {
      for key in keys {
        guard let text = (record[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
          !text.isEmpty, !isAutoDetectLanguage(text)
        else { continue }
        return text
      }
    }
    return nil
  }

  private func extractThinkingText(from body: String) -> String? {
    guard let json = parseJsonObject(from: body, context: "MT-thinking") else {
      let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    let dataObj = detectedLanguageObject(from: json)
    let keys = ["thinking", "content", "text", "output"]
    for record in [json, dataObj].compactMap({ $0 }) {
      for key in keys {
        if let text = (record[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
          !text.isEmpty
        {
          return text
        }
      }
    }
    if let content = ((json["choices"] as? [[String: Any]]) ?? (dataObj?["choices"] as? [[String: Any]]))?
      .first?["message"] as? [String: Any],
      let text = (content["content"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !text.isEmpty
    {
      return text
    }
    return nil
  }

  private func extractTranslatedText(from body: String) throws -> TranslationPayload {
    if let sseError = extractSseErrorMessage(from: body) {
      throw NSError(
        domain: "HypaKeyboardTranslation", code: 3, userInfo: [NSLocalizedDescriptionKey: sseError])
    }
    guard let json = parseJsonObject(from: body, context: "MT") else {
      let p = splitThinkingAndAnswer(body.trimmingCharacters(in: .whitespacesAndNewlines))
      if isInvalidGeneratedText(p.answer) {
        throw NSError(
          domain: "HypaKeyboardTranslation", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "No translation returned"])
      }
      return TranslationPayload(
        translatedText: p.answer, thinkingText: p.thinking, detectedLanguage: nil)
    }
    let dataObj = detectedLanguageObject(from: json)
    let detected = detectedLanguage(from: json, data: dataObj)
    let choices = (json["choices"] as? [[String: Any]]) ?? (dataObj?["choices"] as? [[String: Any]])
    if let content = (choices?.first?["message"] as? [String: Any])?["content"] as? String,
      !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      let p = splitThinkingAndAnswer(content)
      if isInvalidGeneratedText(p.answer) {
        throw NSError(
          domain: "HypaKeyboardTranslation", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "No translation returned"])
      }
      return TranslationPayload(
        translatedText: p.answer, thinkingText: p.thinking, detectedLanguage: detected)
    }
    let candidates: [Any?] = [
      json["translated_text"], json["translation"], json["output"], json["text"],
      dataObj?["translated_text"], dataObj?["translation"], dataObj?["output"], dataObj?["text"],
    ]
    if let direct = candidates.compactMap({
      ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }).first(where: { !$0.isEmpty }) {
      let p = splitThinkingAndAnswer(direct)
      if isInvalidGeneratedText(p.answer) {
        throw NSError(
          domain: "HypaKeyboardTranslation", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "No translation returned"])
      }
      return TranslationPayload(
        translatedText: p.answer, thinkingText: p.thinking, detectedLanguage: detected)
    }
    throw NSError(
      domain: "HypaKeyboardTranslation", code: 1,
      userInfo: [NSLocalizedDescriptionKey: "No translated text in response"])
  }

  private func extractSseErrorMessage(from body: String) -> String? {
    var currentEventType = "message"
    var pendingError: String?
    for rawLine in body.components(separatedBy: .newlines) {
      let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
      if line.isEmpty { continue }
      if line.hasPrefix("event:") {
        let et = String(line.dropFirst(6)).trimmingCharacters(in: .whitespacesAndNewlines)
        currentEventType = et.isEmpty ? "message" : et.lowercased()
        continue
      }
      guard line.hasPrefix("data:") else { continue }
      let data = String(line.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
      if data.isEmpty || data == "[DONE]" { continue }
      if currentEventType == "error" { pendingError = decodeSseData(data) }
    }
    return pendingError
  }

  private func decodeSseData(_ data: String) -> String {
    guard let rawData = data.data(using: .utf8),
      let decoded = try? JSONSerialization.jsonObject(with: rawData)
    else { return data }
    if let s = decoded as? String { return s }
    if let jsonData = try? JSONSerialization.data(withJSONObject: decoded),
      let js = String(data: jsonData, encoding: .utf8)
    {
      return js
    }
    return data
  }

  private func splitThinkingAndAnswer(_ content: String) -> (thinking: String?, answer: String) {
    let range = NSRange(content.startIndex..<content.endIndex, in: content)
    let regex = try? NSRegularExpression(
      pattern: "<think>(.*?)</think>", options: [.dotMatchesLineSeparators, .caseInsensitive])
    let match = regex?.firstMatch(in: content, options: [], range: range)
    let thinking = match.flatMap { Range($0.range(at: 1), in: content) }
      .map { String(content[$0]).trimmingCharacters(in: .whitespacesAndNewlines) }
      .flatMap { $0.isEmpty ? nil : $0 }
    let without =
      regex?.stringByReplacingMatches(in: content, options: [], range: range, withTemplate: "")
      ?? content
    let cleaned = without.components(separatedBy: .newlines)
      .filter {
        let l = $0.trimmingCharacters(in: .whitespacesAndNewlines)
        return !l.hasPrefix("id:") && !l.hasPrefix("data:")
      }
      .joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(
        in: CharacterSet(charactersIn: "\""))
    return (thinking, cleaned)
  }

  private let fullDocumentMaxHops = 60
  private let fullDocumentHopDelay: TimeInterval = 0.06
  private let fullDocumentEmptyReadRetries = 3

  private func moveCursorToDocumentEnd(
    hopsLeft: Int, moved: Int = 0, retriesLeft: Int? = nil,
    isCancelled: @escaping () -> Bool = { false },
    onCancelled: ((Int) -> Void)? = nil,
    completion: @escaping (Int) -> Void
  ) {
    guard !isCancelled() else {
      onCancelled?(moved)
      return
    }
    let retries = retriesLeft ?? fullDocumentEmptyReadRetries
    let after = textDocumentProxy.documentContextAfterInput ?? ""
    guard hopsLeft > 0 else {
      completion(moved)
      return
    }
    if after.isEmpty {
      guard retries > 0 else {
        completion(moved)
        return
      }
      let nudge = retries < fullDocumentEmptyReadRetries ? 1 : 0
      let beforeNudge = textDocumentProxy.documentContextBeforeInput ?? ""
      if nudge > 0 { textDocumentProxy.adjustTextPosition(byCharacterOffset: nudge) }
      DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
        guard let self else { return }
        let didMove =
          nudge > 0 && (self.textDocumentProxy.documentContextBeforeInput ?? "") != beforeNudge
        self.moveCursorToDocumentEnd(
          hopsLeft: hopsLeft - (didMove ? 1 : 0),
          moved: moved + (didMove ? 1 : 0), retriesLeft: retries - 1,
          isCancelled: isCancelled,
          onCancelled: onCancelled,
          completion: completion)
      }
      return
    }
    textDocumentProxy.adjustTextPosition(byCharacterOffset: after.count)
    DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
      self?.moveCursorToDocumentEnd(
        hopsLeft: hopsLeft - 1, moved: moved + after.count, isCancelled: isCancelled,
        onCancelled: onCancelled,
        completion: completion)
    }
  }

  private func collectDocumentTextBackward(
    accumulated: String, hopsLeft: Int, moved: Int, lastChunk: String? = nil,
    retriesLeft: Int? = nil, isCancelled: @escaping () -> Bool = { false },
    onCancelled: ((Int) -> Void)? = nil,
    completion: @escaping (String, Int) -> Void
  ) {
    guard !isCancelled() else {
      onCancelled?(moved)
      return
    }
    let retries = retriesLeft ?? fullDocumentEmptyReadRetries
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    guard hopsLeft > 0 else {
      completion(accumulated, moved)
      return
    }
    if before.isEmpty {
      if retries > 0 {
        DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
          self?.collectDocumentTextBackward(
            accumulated: accumulated, hopsLeft: hopsLeft, moved: moved, lastChunk: lastChunk,
            retriesLeft: retries - 1, isCancelled: isCancelled, onCancelled: onCancelled,
            completion: completion)
        }
        return
      }

      let afterNudge = textDocumentProxy.documentContextAfterInput ?? ""
      textDocumentProxy.adjustTextPosition(byCharacterOffset: -1)
      DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
        guard let self else { return }
        let updatedAfter = self.textDocumentProxy.documentContextAfterInput ?? ""
        guard updatedAfter != afterNudge, let crossedCharacter = updatedAfter.first else {
          if isCancelled() {
            onCancelled?(moved)
            return
          }
          completion(accumulated, moved)
          return
        }
        self.collectDocumentTextBackward(
          accumulated: String(crossedCharacter) + accumulated,
          hopsLeft: hopsLeft - 1, moved: moved + 1, lastChunk: nil,
          isCancelled: isCancelled, onCancelled: onCancelled,
          completion: completion)
      }
      return
    }
    if let lastChunk, before == lastChunk, retries > 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
        self?.collectDocumentTextBackward(
          accumulated: accumulated, hopsLeft: hopsLeft, moved: moved, lastChunk: lastChunk,
          retriesLeft: retries - 1, isCancelled: isCancelled, onCancelled: onCancelled,
          completion: completion)
      }
      return
    }
    textDocumentProxy.adjustTextPosition(byCharacterOffset: -before.count)
    DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) { [weak self] in
      self?.collectDocumentTextBackward(
        accumulated: before + accumulated, hopsLeft: hopsLeft - 1, moved: moved + before.count,
        lastChunk: before, isCancelled: isCancelled, onCancelled: onCancelled,
        completion: completion)
    }
  }

  private func readFullDocumentText(
    isCancelled: @escaping () -> Bool = { false }, completion: @escaping (String, Int) -> Void
  ) {
    guard !isCancelled() else { return }
    if let sel = textDocumentProxy.selectedText,
      !sel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      completion(sel, 0)
      return
    }
    isTraversingDocument = true
    moveCursorToDocumentEnd(
      hopsLeft: fullDocumentMaxHops, isCancelled: isCancelled,
      onCancelled: { [weak self] movedForward in
        self?.isTraversingDocument = false
        guard movedForward != 0 else { return }
        self?.textDocumentProxy.adjustTextPosition(byCharacterOffset: -movedForward)
      },
      completion: { [weak self] movedForward in
        guard let self else { return }
        guard !isCancelled() else {
          self.isTraversingDocument = false
          return
        }
        self.collectDocumentTextBackward(
          accumulated: "", hopsLeft: self.fullDocumentMaxHops, moved: 0,
          isCancelled: isCancelled,
          onCancelled: { [weak self] movedBackward in
            self?.isTraversingDocument = false
            let restore = movedBackward - movedForward
            if restore != 0 {
              self?.textDocumentProxy.adjustTextPosition(byCharacterOffset: restore)
            }
          },
          completion: { text, movedBackward in
            guard !isCancelled() else {
              self.isTraversingDocument = false
              return
            }
            let restore = movedBackward - movedForward
            if restore != 0 {
              self.textDocumentProxy.adjustTextPosition(byCharacterOffset: restore)
            }
            devLog("[DOC] read %ld chars", text.count)
            DispatchQueue.main.asyncAfter(deadline: .now() + self.fullDocumentHopDelay) {
              guard !isCancelled() else {
                self.isTraversingDocument = false
                return
              }
              self.isTraversingDocument = false
              completion(text, movedBackward - movedForward)
            }
          })
      })
  }

  private func deleteEntireDocument(
    isCancelled: @escaping () -> Bool = { false }, completion: @escaping () -> Void
  ) {
    guard !isCancelled() else { return }
    isTraversingDocument = true
    moveCursorToDocumentEnd(
      hopsLeft: fullDocumentMaxHops, isCancelled: isCancelled,
      onCancelled: { [weak self] movedForward in
        self?.isTraversingDocument = false
        guard movedForward != 0 else { return }
        self?.textDocumentProxy.adjustTextPosition(byCharacterOffset: -movedForward)
      },
      completion: { [weak self] _ in
        guard let self else { return }
        guard !isCancelled() else {
          self.isTraversingDocument = false
          return
        }
        self.isTraversingDocument = false
        self.isMutatingTranslationDocument = true
        self.deleteBackwardChunks(
          hopsLeft: self.fullDocumentMaxHops, completion: completion)
      })
  }

  private func deleteBackwardChunks(
    hopsLeft: Int, retriesLeft: Int? = nil, completion: @escaping () -> Void
  ) {
    let retries = retriesLeft ?? fullDocumentEmptyReadRetries
    let before = textDocumentProxy.documentContextBeforeInput ?? ""
    guard hopsLeft > 0 else {
      completion()
      return
    }
    if before.isEmpty {
      if retries > 0 {
        DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) {
          self.deleteBackwardChunks(
            hopsLeft: hopsLeft, retriesLeft: retries - 1, completion: completion)
        }
        return
      }

      let afterNudge = textDocumentProxy.documentContextAfterInput ?? ""
      textDocumentProxy.adjustTextPosition(byCharacterOffset: -1)
      DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) {
        let updatedAfter = self.textDocumentProxy.documentContextAfterInput ?? ""
        guard updatedAfter != afterNudge else {
          completion()
          return
        }
        self.textDocumentProxy.adjustTextPosition(byCharacterOffset: 1)
        self.textDocumentProxy.deleteBackward()
        DispatchQueue.main.asyncAfter(deadline: .now() + self.fullDocumentHopDelay) {
          self.deleteBackwardChunks(hopsLeft: hopsLeft - 1, completion: completion)
        }
      }
      return
    }
    for _ in before { textDocumentProxy.deleteBackward() }
    DispatchQueue.main.asyncAfter(deadline: .now() + fullDocumentHopDelay) {
      self.deleteBackwardChunks(hopsLeft: hopsLeft - 1, completion: completion)
    }
  }

  private func startTts(
    overrideText: String? = nil, overrideLanguageName: String? = nil, restart: Bool = false
  ) {
    if restart {
      stopTts()
    } else {
      guard !isTtsLoading else { return }
      if isTtsPlaying {
        stopTts()
        return
      }
    }
    let generation = beginTtsRequest()
    activeDictionarySpeechIdentifier = nil
    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard hasFullAccess else {
      showToolbarError(.tts, KeyboardErrorCatalog.fullAccessNeeded)
      return
    }
    ttsAudioData = nil
    isTtsPaused = false
    isTtsLoading = true
    updateUI()
    applyToolbarTheme()
    if let overrideText {
      let text = overrideText.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else {
        isTtsLoading = false
        showToolbarError(.tts, KeyboardErrorCatalog.typeOrSelectText)
        updateUI()
        return
      }
      sendTtsRequest(
        text: text, token: token, generation: generation,
        languageNameOverride: overrideLanguageName)
      return
    }
    readFullDocumentText { [weak self] fullText, _ in
      guard let self, self.isCurrentTtsRequest(generation) else { return }
      let text = fullText.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else {
        self.isTtsLoading = false
        self.showToolbarError(.tts, KeyboardErrorCatalog.typeOrSelectText)
        self.updateUI()
        return
      }
      self.sendTtsRequest(text: text, token: token, generation: generation)
    }
  }

  private func sendTtsRequest(
    text: String, token: String, generation: Int, languageNameOverride: String? = nil
  ) {
    guard let url = apiURL("/v2/translate/tts") else {
      isTtsLoading = false
      showToolbarError(.tts, KeyboardErrorCatalog.tryAgain)
      updateUI()
      return
    }
    let voice: String
    let languageName: String
    if let languageNameOverride {
      voice = resolvedTtsVoice(forLanguage: languageNameOverride)
      languageName = languageNameOverride
    } else {
      normalizeSelectedVoiceForTtsLanguage(persist: true)
      voice = resolvedTtsVoice()
      languageName = resolvedTtsLanguage().name
    }
    guard !voice.isEmpty else {
      isTtsLoading = false
      showToolbarError(.tts, KeyboardErrorCatalog.noVoice)
      updateUI()
      return
    }
    let serviceModel = resolvedTtsServiceModel()
    let payload: [String: Any] = [
      "provider": serviceModel.provider, "model": serviceModel.model, "voice": voice,
      "top_p": 0.4, "temperature": 0.6, "repetition_penalty": 2.0,
      "max_tokens": 2048, "language": languageName, "text": text,
    ]
    devLog(
      "[TTS] ▶ voice=%@ language=%@ text=%@", voice, languageName, String(text.prefix(80)))
    guard let req = makeAuthorizedPostRequest(url: url, token: token, payload: payload, timeout: 45)
    else {
      isTtsLoading = false
      showToolbarError(.tts, KeyboardErrorCatalog.tryAgain)
      updateUI()
      return
    }

    ttsTask = URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        guard self.isCurrentTtsRequest(generation) else { return }
        if let error {
          devLog("[TTS] ✗ %@", error.localizedDescription)
          self.isTtsLoading = false
          self.showToolbarError(.tts, KeyboardErrorCatalog.network(error))
          self.updateUI()
          return
        }
        if let errMsg = self.checkHttpError(response: response, data: data, context: "TTS") {
          self.isTtsLoading = false
          self.showToolbarError(.tts, errMsg)
          self.updateUI()
          return
        }
        guard let data else {
          self.isTtsLoading = false
          self.showToolbarError(.tts, KeyboardErrorCatalog.noAudio)
          self.updateUI()
          return
        }
        if let audioData = self.extractAudioData(from: data) {
          self.playTtsAudio(audioData, generation: generation)
        } else {
          devLog("[TTS] ✗ Missing audio_b64")
          self.isTtsLoading = false
          self.showToolbarError(.tts, KeyboardErrorCatalog.noAudio)
          self.updateUI()
        }
      }
    }
    ttsTask?.resume()
  }

  private func playTtsAudio(_ data: Data, generation: Int, dictionaryIdentifier: String? = nil) {
    guard isCurrentTtsRequest(generation, dictionaryIdentifier: dictionaryIdentifier) else {
      return
    }
    do {
      try activatePlaybackAudioSession()
      ttsAudioData = data
      ttsAudioPlayer = try AVAudioPlayer(data: data)
      ttsAudioPlayer?.delegate = self
      ttsAudioPlayer?.prepareToPlay()
      isTtsLoading = false
      isTtsPlaying = true
      isTtsPaused = false
      updateListenButtonLoading(dictionaryIdentifier, isLoading: false)
      updateUI()
      applyToolbarTheme()
      ttsAudioPlayer?.play()
      devLog("[TTS] ▶ duration=%.1fs", ttsAudioPlayer?.duration ?? 0)
    } catch {
      devLog("[TTS] ✗ Playback error: %@", error.localizedDescription)
      isTtsLoading = false
      isTtsPlaying = false
      ttsAudioPlayer = nil
      updateListenButtonLoading(dictionaryIdentifier, isLoading: false)
      activeDictionarySpeechIdentifier = nil
      if dictionaryIdentifier == nil {
        showToolbarError(.tts, KeyboardErrorCatalog.playbackFailed)
      } else {
        showToolbarError(.dictionary, KeyboardErrorCatalog.playbackFailed)
      }
      updateUI()
      applyToolbarTheme()
    }
  }

  private func pauseTtsPlayback() {
    guard isTtsPlaying else { return }
    ttsAudioPlayer?.pause()
    isTtsPlaying = false
    isTtsPaused = true
    deactivateAudioSession()
    applyToolbarTheme()
  }

  private func resumeTtsPlayback() {
    guard let player = ttsAudioPlayer ?? (ttsAudioData.flatMap { try? AVAudioPlayer(data: $0) })
    else { return }
    do {
      try activatePlaybackAudioSession()
      if ttsAudioPlayer == nil {
        ttsAudioPlayer = player
        player.delegate = self
        player.prepareToPlay()
      }
      player.play()
      isTtsPaused = false
      isTtsPlaying = true
      updateUI()
      applyToolbarTheme()
    } catch {
      devLog("[TTS] ✗ Resume error: %@", error.localizedDescription)
      showToolbarError(.tts, KeyboardErrorCatalog.playbackFailed)
    }
  }

  private func stopTts() {
    let id = activeDictionarySpeechIdentifier
    ttsRequestGeneration += 1
    ttsTask?.cancel()
    ttsTask = nil
    isTtsLoading = false
    isTtsPlaying = false
    isTtsPaused = false
    ttsAudioPlayer?.stop()
    ttsAudioPlayer = nil
    ttsAudioData = nil
    activeDictionarySpeechIdentifier = nil
    updateListenButtonLoading(id, isLoading: false)
    deactivateAudioSession()
    devLog("[TTS] ■ Stopped")
    applyToolbarTheme()
  }

  private func startSttListening() {
    guard !isSttListening, !isSttStarting, !isSttProcessing else { return }
    guard hasFullAccess else {
      showToolbarError(.stt, KeyboardErrorCatalog.fullAccessNeeded)
      return
    }

    isSttStarting = true
    sttFullRecording = Data()
    sttRecordedWav = nil
    hasSttRecordingReady = false
    updateUI()
    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] allowed in
      DispatchQueue.main.async {
        guard let self else { return }
        guard allowed else {
          self.isSttStarting = false
          self.showToolbarError(.stt, KeyboardErrorCatalog.micNeeded)
          self.updateUI()
          return
        }
        do {
          try self.startAudioCapture()
          self.isSttStarting = false
          self.isSttListening = true
          self.startSttPulse()
          self.updateUI()
          devLog("[STT] ▶ Recording started")
        } catch {
          devLog("[STT] ✗ %@", error.localizedDescription)
          self.isSttStarting = false
          self.showToolbarError(.stt, KeyboardErrorCatalog.recordingFailed)
          self.updateUI()
        }
      }
    }
  }

  private func stopSttRecording() {
    guard isSttListening else { return }
    stopAudioCapture()
    isSttListening = false
    stopSttPulse()
    devLog("[STT] ■ Stopped, buffer=%d bytes", sttFullRecording.count)
    guard !sttFullRecording.isEmpty else {
      showToolbarError(.stt, KeyboardErrorCatalog.noAudio)
      updateUI()
      return
    }
    sttRecordedWav = buildWavData(pcm: sttFullRecording, sampleRate: 16000)
    sttFullRecording = Data()
    hasSttRecordingReady = true
    updateUI()
  }

  private func stopSttListening() {
    isSttStarting = false
    isSttListening = false
    isSttProcessing = false
    hasSttRecordingReady = false
    sttRecordedWav = nil
    stopSttPulse()
    stopAudioCapture()
    sttFullRecording = Data()
  }

  private func submitAsrRecording() {
    let token = settings.token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = apiURL("/v2/translate/stt") else {
      showToolbarError(.stt, KeyboardErrorCatalog.tryAgain)
      updateUI()
      return
    }

    let wav: Data
    if let recorded = sttRecordedWav {
      wav = recorded
    } else {
      guard !sttFullRecording.isEmpty else {
        showToolbarError(.stt, KeyboardErrorCatalog.noAudio)
        updateUI()
        return
      }
      wav = buildWavData(pcm: sttFullRecording, sampleRate: 16000)
      sttFullRecording = Data()
    }

    let serviceModel = KeyboardLanguageCatalog.resolveStt(
      selectedProvider: settings.sttProvider, selectedModel: settings.sttModel)
    var payload: [String: Any] = [
      "audio": wav.base64EncodedString(), "audio_type": "base64",
      "provider": serviceModel.provider, "model": serviceModel.model,
    ]
    if selectedSttLanguageCode != "auto" { payload["language"] = selectedSttLanguageName }
    guard let req = makeAuthorizedPostRequest(url: url, token: token, payload: payload, timeout: 30)
    else {
      showToolbarError(.stt, KeyboardErrorCatalog.tryAgain)
      updateUI()
      return
    }

    devLog("[STT] ▶ ASR request, audio=%d bytes", wav.count)
    isSttProcessing = true
    hasSttRecordingReady = false
    updateUI()

    URLSession.shared.dataTask(with: req) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        self.isSttProcessing = false
        if let error {
          devLog("[STT] ✗ %@", error.localizedDescription)
          self.hasSttRecordingReady = self.sttRecordedWav != nil
          self.showToolbarError(.stt, KeyboardErrorCatalog.network(error))
          self.updateUI()
          return
        }
        if let errMsg = self.checkHttpError(response: response, data: data, context: "STT") {
          self.hasSttRecordingReady = self.sttRecordedWav != nil
          self.showToolbarError(.stt, errMsg)
          self.updateUI()
          return
        }
        guard let data, let bodyStr = String(data: data, encoding: .utf8) else {
          self.hasSttRecordingReady = self.sttRecordedWav != nil
          self.showToolbarError(.stt, KeyboardErrorCatalog.tryAgain)
          self.updateUI()
          return
        }
        if let transcript = self.extractSttTranscript(bodyStr) {
          devLog("[STT] ✓ transcript=%@", transcript)
          self.commitSttTranscript(transcript)
          self.sttRecordedWav = nil
          self.sttCapturedText = ""
          self.featureMode = .keyboard
          self.rebuildKeyboard()
        } else {
          devLog("[STT] ✗ Parse failed. Body=%@", bodyStr)
          self.hasSttRecordingReady = self.sttRecordedWav != nil
          self.showToolbarError(.stt, KeyboardErrorCatalog.noSpeech)
          self.updateUI()
        }
      }
    }.resume()
  }

  private func startAudioCapture() throws {
    stopAudioCapture()
    sttAudioQueue.sync { self.sttFullRecording.removeAll(keepingCapacity: true) }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
    try session.setPreferredSampleRate(16000)
    try session.setActive(true)
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let inFmt = input.outputFormat(forBus: 0)
    guard inFmt.channelCount > 0 else {
      throw NSError(
        domain: "HypaKeyboardSTT", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No microphone input channel"])
    }
    guard
      let outFmt = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true),
      let conv = AVAudioConverter(from: inFmt, to: outFmt)
    else {
      throw NSError(
        domain: "HypaKeyboardSTT", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Unable to configure audio converter"])
    }
    input.installTap(onBus: 0, bufferSize: 2048, format: inFmt) { [weak self] buf, _ in
      self?.handleAudioBuffer(buf, converter: conv, outputFormat: outFmt)
    }
    sttAudioEngine = engine
    engine.prepare()
    try engine.start()
  }

  private func handleAudioBuffer(
    _ buf: AVAudioPCMBuffer, converter: AVAudioConverter, outputFormat: AVAudioFormat
  ) {
    let ratio = outputFormat.sampleRate / buf.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buf.frameLength) * ratio) + 1
    guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
      return
    }
    var fed = false
    var err: NSError?
    let status = converter.convert(to: converted, error: &err) { _, outStatus in
      if fed {
        outStatus.pointee = .noDataNow
        return nil
      }
      fed = true
      outStatus.pointee = .haveData
      return buf
    }
    guard status != .error, converted.frameLength > 0, err == nil,
      let ch = converted.int16ChannelData
    else { return }
    let data = Data(bytes: ch[0], count: Int(converted.frameLength) * MemoryLayout<Int16>.size)
    sttAudioQueue.async { [weak self] in self?.sttFullRecording.append(data) }
  }

  private func stopAudioCapture() {
    if let engine = sttAudioEngine {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
    }
    sttAudioEngine = nil
    deactivateAudioSession()
  }

  private func commitSttTranscript(_ transcript: String) {
    guard !isMutatingTranslationDocument else { return }
    let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    discardTranslationUndo()
    sttCapturedText = trimmed
    sttLiveLabel?.text = trimmed
    sttLiveLabel?.textColor = settings.theme.label
    let documentContext = limitedTextContext()
    if !documentContext.selected.isEmpty {
      textDocumentProxy.insertText(trimmed)
      return
    }
    let after = documentContext.after
    if !after.isEmpty { textDocumentProxy.adjustTextPosition(byCharacterOffset: after.count) }
    let before = documentContext.before
    textDocumentProxy.insertText((before.isEmpty ? "" : " ") + trimmed)
    devLog("[STT] ✓ Transcript appended to field")
  }

  private func startSttPulse() {
    stopSttPulse()
    sttPulseTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      _ = self
    }
  }

  private func stopSttPulse() {
    sttPulseTimer?.invalidate()
    sttPulseTimer = nil
  }

  private func extractSttTranscript(_ body: String) -> String? {
    if isInvalidGeneratedText(body) { return nil }
    guard let obj = parseJsonObject(from: body, context: "STT") else { return nil }
    if let resp = obj["response"] as? [String: Any], let t = resp["text"] as? String,
      !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      let tr = t.trimmingCharacters(in: .whitespacesAndNewlines)
      return isInvalidGeneratedText(tr) ? nil : tr
    }
    if let t = obj["text"] as? String, !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      let tr = t.trimmingCharacters(in: .whitespacesAndNewlines)
      return isInvalidGeneratedText(tr) ? nil : tr
    }
    if let t = obj["transcript"] as? String,
      !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      let tr = t.trimmingCharacters(in: .whitespacesAndNewlines)
      return isInvalidGeneratedText(tr) ? nil : tr
    }
    if let ch = obj["channel"] as? [String: Any], let alts = ch["alternatives"] as? [[String: Any]],
      let t = alts.first?["transcript"] as? String,
      !t.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      let tr = t.trimmingCharacters(in: .whitespacesAndNewlines)
      return isInvalidGeneratedText(tr) ? nil : tr
    }
    devLog("[STT] ✗ No transcript field found in response")
    return nil
  }

  private func buildWavData(pcm: Data, sampleRate: UInt32) -> Data {
    var data = Data()
    let len = UInt32(pcm.count)
    appendAscii("RIFF", to: &data)
    appendUInt32LE(len + 36, to: &data)
    appendAscii("WAVE", to: &data)
    appendAscii("fmt ", to: &data)
    appendUInt32LE(16, to: &data)
    appendUInt16LE(1, to: &data)
    appendUInt16LE(1, to: &data)
    appendUInt32LE(sampleRate, to: &data)
    appendUInt32LE(sampleRate * 2, to: &data)
    appendUInt16LE(2, to: &data)
    appendUInt16LE(16, to: &data)
    appendAscii("data", to: &data)
    appendUInt32LE(len, to: &data)
    data.append(pcm)
    return data
  }
  private func appendAscii(_ s: String, to d: inout Data) {
    d.append(s.data(using: .ascii) ?? Data())
  }
  private func appendUInt32LE(_ v: UInt32, to d: inout Data) {
    var le = v.littleEndian
    withUnsafeBytes(of: &le) { d.append(contentsOf: $0) }
  }
  private func appendUInt16LE(_ v: UInt16, to d: inout Data) {
    var le = v.littleEndian
    withUnsafeBytes(of: &le) { d.append(contentsOf: $0) }
  }

  private func markKeyboardLoaded() {
    let defaults = keyboardSharedDefaults(reason: "markKeyboardLoaded").defaults
    defaults.set(true, forKey: keyboardLoadedKey)
    defaults.set(hasFullAccess, forKey: keyboardFullAccessKey)
    defaults.set(Date().timeIntervalSince1970, forKey: keyboardFullAccessCheckedAtKey)
    defaults.synchronize()
  }

  private func saveSelectedVoice(_ voice: String) {
    let trimmed = voice.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    guard
      let resolved = voicesForTtsLanguage().first(where: {
        $0.caseInsensitiveCompare(trimmed) == .orderedSame
      })
    else { return }
    let defaults = keyboardSharedDefaults(reason: "saveSelectedVoice").defaults
    let raw = defaults.string(forKey: prefsKey) ?? defaultSettingsJson()
    guard let data = raw.data(using: .utf8),
      var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    selectedVoice = resolved
    obj["voice"] = resolved
    if let updated = try? JSONSerialization.data(withJSONObject: obj),
      let json = String(data: updated, encoding: .utf8)
    {
      defaults.set(json, forKey: prefsKey)
      defaults.synchronize()
    }
    settings = settings.updating(voice: resolved)
  }

  private func saveSharedLanguageSettings(
    keyboardLanguageId: String? = nil,
    translateSourceLanguage: String? = nil,
    translateTargetLanguage: String? = nil,
    dictionaryLanguage: String? = nil,
    ttsLanguage: String? = nil
  ) {
    let defaults = keyboardSharedDefaults(reason: "saveSharedLanguageSettings").defaults
    let raw = defaults.string(forKey: prefsKey) ?? defaultSettingsJson()
    guard let data = raw.data(using: .utf8),
      var obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }

    if let keyboardLanguageId {
      obj["languageId"] = keyboardLanguageId
    }
    if let translateSourceLanguage {
      obj["translateSourceLanguage"] = translateSourceLanguage
    }
    if let translateTargetLanguage {
      obj["translateTargetLanguage"] = translateTargetLanguage
    }
    if let dictionaryLanguage {
      obj["dictionaryLanguage"] = dictionaryLanguage
    }
    if let ttsLanguage {
      obj["ttsLanguage"] = ttsLanguage
    }

    if let updated = try? JSONSerialization.data(withJSONObject: obj),
      let json = String(data: updated, encoding: .utf8)
    {
      defaults.set(json, forKey: prefsKey)
      defaults.synchronize()
    }

    settings = settings.updating(
      languageId: keyboardLanguageId,
      ttsLanguage: ttsLanguage,
      translateSourceLanguage: translateSourceLanguage,
      translateTargetLanguage: translateTargetLanguage,
      dictionaryLanguage: dictionaryLanguage
    )
  }

  private func canonicalLanguageCode(_ code: String) -> String {
    KeyboardLanguageCatalog.canonicalCode(code)
  }

  private static func loadSettings() -> KeyboardSettings {
    let storage = keyboardSharedDefaults(reason: "loadSettings")
    let defaults = storage.defaults
    let raw = defaults.string(forKey: prefsKey) ?? defaultSettingsJson()
    appendKeyboardStorageDebug(
      "loadSettings read settings_json from \(storage.groupId); hasValue=\(defaults.string(forKey: prefsKey) != nil)",
      groupId: storage.groupId
    )
    guard let data = raw.data(using: .utf8),
      let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return fallbackSettings() }
    let dark = obj["themeDark"] as? [String: Any] ?? [:]
    let themeDark = KeyboardTheme(
      surface: color(dark["surface"], fallback: "#1A1A1A"),
      toolbar: color(dark["toolbar"], fallback: "#515151"),
      key: color(dark["key"], fallback: "#515151"),
      keyPressed: color(dark["keyPressed"], fallback: "#444444"),
      label: color(dark["label"], fallback: "#FFFFFF"),
      accent: color(dark["accent"], fallback: "#515151"),
      pill: color(dark["pill"], fallback: "#FFFFFF"),
      pillLabel: color(dark["pillLabel"], fallback: "#111111"))
    let light = obj["themeLight"] as? [String: Any] ?? [:]
    let themeLight = KeyboardTheme(
      surface: color(light["surface"], fallback: "#D1D5DB"),
      toolbar: color(light["toolbar"], fallback: "#FFFFFF"),
      key: color(light["key"], fallback: "#FFFFFF"),
      keyPressed: color(light["keyPressed"], fallback: "#E5E7EB"),
      label: color(light["label"], fallback: "#111111"),
      accent: color(light["accent"], fallback: "#6B7280"),
      pill: color(light["pill"], fallback: "#111111"),
      pillLabel: color(light["pillLabel"], fallback: "#FFFFFF"))
    let appearance =
      KeyboardAppearance(rawValue: (obj["appearance"] as? String ?? "system").lowercased())
      ?? .system
    let fs = CGFloat(obj["fontSize"] as? Double ?? 15)
    let kh = CGFloat(obj["keyboardHeight"] as? Double ?? 260)
    let translation = KeyboardLanguageCatalog.resolveTranslation(
      selectedProvider: obj["translationProvider"] as? String
        ?? KeyboardLanguageCatalog.defaultProviderName,
      selectedModel: obj["translationModel"] as? String
        ?? KeyboardLanguageCatalog.defaultTranslationModelName)
    let dictionary = KeyboardLanguageCatalog.resolveDictionary(
      selectedProvider: obj["dictionaryProvider"] as? String
        ?? KeyboardLanguageCatalog.defaultProviderName,
      selectedModel: obj["dictionaryModel"] as? String
        ?? KeyboardLanguageCatalog.defaultDictionaryModelName)
    let tts = KeyboardLanguageCatalog.resolveTts(
      selectedProvider: obj["ttsProvider"] as? String
        ?? KeyboardLanguageCatalog.defaultProviderName,
      selectedModel: obj["ttsModel"] as? String ?? KeyboardLanguageCatalog.defaultTtsModelName)
    let stt = KeyboardLanguageCatalog.resolveStt(
      selectedProvider: obj["sttProvider"] as? String
        ?? KeyboardLanguageCatalog.defaultProviderName,
      selectedModel: obj["sttModel"] as? String ?? KeyboardLanguageCatalog.defaultSttModelName)
    return KeyboardSettings(
      themeLight: themeLight, themeDark: themeDark, appearance: appearance,
      hapticsEnabled: obj["hapticsEnabled"] as? Bool ?? true,
      longPressDurationMs: min(max(obj["longPressDurationMs"] as? Int ?? 500, 150), 500),
      predictiveBarEnabled: obj["predictiveBarEnabled"] as? Bool ?? true,
      autocorrectEnabled: obj["autocorrectEnabled"] as? Bool ?? true,
      fontSize: min(max(fs, 12), 22), keyboardHeight: min(max(kh, 220), 420),
      languageId: obj["languageId"] as? String
        ?? KeyboardLanguageCatalog.defaultSourceLanguage.code,
      name: obj["name"] as? String ?? "",
      token: obj["token"] as? String ?? "",
      translationProvider: translation.provider,
      translationModel: translation.model,
      dictionaryProvider: dictionary.provider,
      dictionaryModel: dictionary.model,
      ttsProvider: tts.provider,
      ttsModel: tts.model,
      sttProvider: stt.provider,
      sttModel: stt.model,
      voice: obj["voice"] as? String ?? KeyboardLanguageCatalog.defaultVoice,
      ttsLanguage: obj["ttsLanguage"] as? String
        ?? KeyboardLanguageCatalog.defaultSourceLanguage.code,
      translateSourceLanguage: obj["translateSourceLanguage"] as? String
        ?? KeyboardLanguageCatalog.autoDetect.name,
      translateTargetLanguage: obj["translateTargetLanguage"] as? String
        ?? KeyboardLanguageCatalog.defaultTargetLanguage.name,
      dictionaryLanguage: obj["dictionaryLanguage"] as? String
        ?? KeyboardLanguageCatalog.defaultDictionaryLanguage.name,
      autoSpeakTranslationsKeyboard: obj["autoSpeakTranslationsKeyboard"] as? Bool
        ?? obj["autoSpeakTranslations"] as? Bool ?? false,
      autoTranslateOnLanguageChange: obj["autoTranslateOnLanguageChange"] as? Bool ?? true,
      autoLookupOnLanguageChange: obj["autoLookupOnLanguageChange"] as? Bool ?? true)
  }

  private static func fallbackSettings() -> KeyboardSettings {
    KeyboardSettings(
      themeLight: KeyboardTheme(
        surface: UIColor(hex: "#D1D5DB"), toolbar: UIColor(hex: "#FFFFFF"),
        key: UIColor(hex: "#FFFFFF"), keyPressed: UIColor(hex: "#E5E7EB"),
        label: UIColor(hex: "#111111"), accent: UIColor(hex: "#6B7280"),
        pill: UIColor(hex: "#111111"), pillLabel: UIColor(hex: "#FFFFFF")),
      themeDark: KeyboardTheme(
        surface: UIColor(hex: "#1A1A1A"), toolbar: UIColor(hex: "#515151"),
        key: UIColor(hex: "#515151"), keyPressed: UIColor(hex: "#444444"),
        label: UIColor(hex: "#FFFFFF"), accent: UIColor(hex: "#515151"),
        pill: UIColor(hex: "#FFFFFF"), pillLabel: UIColor(hex: "#111111")),
      appearance: .system,
      hapticsEnabled: true, longPressDurationMs: 500, predictiveBarEnabled: true,
      autocorrectEnabled: true,
      fontSize: 15, keyboardHeight: 260,
      languageId: KeyboardLanguageCatalog.defaultSourceLanguage.code, name: "", token: "",
      translationProvider: KeyboardLanguageCatalog.defaultProviderName,
      translationModel: KeyboardLanguageCatalog.defaultTranslationModelName,
      dictionaryProvider: KeyboardLanguageCatalog.defaultProviderName,
      dictionaryModel: KeyboardLanguageCatalog.defaultDictionaryModelName,
      ttsProvider: KeyboardLanguageCatalog.defaultProviderName,
      ttsModel: KeyboardLanguageCatalog.defaultTtsModelName,
      sttProvider: KeyboardLanguageCatalog.defaultProviderName,
      sttModel: KeyboardLanguageCatalog.defaultSttModelName,
      voice: KeyboardLanguageCatalog.defaultVoice,
      ttsLanguage: KeyboardLanguageCatalog.defaultSourceLanguage.code,
      translateSourceLanguage: KeyboardLanguageCatalog.autoDetect.name,
      translateTargetLanguage: KeyboardLanguageCatalog.defaultTargetLanguage.name,
      dictionaryLanguage: KeyboardLanguageCatalog.defaultDictionaryLanguage.name,
      autoSpeakTranslationsKeyboard: false,
      autoTranslateOnLanguageChange: true,
      autoLookupOnLanguageChange: true)
  }

  private static func color(_ v: Any?, fallback: String) -> UIColor {
    UIColor(hex: v as? String ?? fallback)
  }
}

extension KeyboardViewController: KeyHostViewDelegate {
  func keyHost(_ host: KeyHostView, didPressDown key: KeyButton) {
    guard cursorTrackpad == nil else { return }
    isApplyingKeyboardText = true
    if key.keyName == "backspace" {
      backspaceDown()
    } else if !commitsOnTouchUp(key.keyName) {
      handleKey(key)
    }
    key.setPressed(true)
    showKeyPreview(for: key)
    playKeyFeedback()
  }

  func keyHost(_ host: KeyHostView, didBeginHold key: KeyButton, at point: CGPoint) -> Bool {
    guard cursorTrackpad == nil else { return false }
    dismissKeyPreview()
    if key.keyName == "space" {
      return beginCursorTrackpad(at: host.convert(point, to: view), key: key)
    }
    return beginKeyHold(key)
  }

  func keyHost(_ host: KeyHostView, didMoveHold key: KeyButton, to point: CGPoint) {
    if cursorTrackpad != nil {
      updateCursorTrackpad(to: host.convert(point, to: view))
      return
    }
    highlightAlternate(at: host.convert(point, to: view))
  }

  func keyHost(
    _ host: KeyHostView, didPressUp key: KeyButton, at point: CGPoint, held: Bool, cancelled: Bool
  ) {
    key.setPressed(false)
    defer { isApplyingKeyboardText = false }
    dismissKeyPreview()
    if key.keyName == "backspace" {
      stopDeleteRepeat(refreshUI: true)
      return
    }
    if cursorTrackpad != nil {
      guard held else { return }
      endCursorTrackpad()
      scheduleContextRefresh()
      return
    }
    if held {
      endKeyHold(key, at: host.convert(point, to: view), cancelled: cancelled)
      return
    }
    if cancelled {
      rollbackCommittedKey(key)
      return
    }
    guard commitsOnTouchUp(key.keyName) else { return }
    handleKey(key)
  }
}

extension KeyboardViewController: AVAudioPlayerDelegate {
  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    if player === ttsAudioPlayer {
      devLog("[TTS] ✓ Playback finished")
      let id = activeDictionarySpeechIdentifier
      isTtsPlaying = false
      isTtsPaused = false
      ttsAudioPlayer?.currentTime = 0
      activeDictionarySpeechIdentifier = nil
      updateListenButtonLoading(id, isLoading: false)
      deactivateAudioSession()
      updateUI()
      applyToolbarTheme()
    } else if player === sttPreviewPlayer {
      devLog("[STT] ✓ Preview playback finished")
      isSttPreviewPlaying = false
      sttPreviewPlayer?.currentTime = 0
      deactivateAudioSession()
      updateUI()
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    if player === ttsAudioPlayer {
      devLog("[TTS] ✗ Decode error: %@", error?.localizedDescription ?? "unknown")
      let id = activeDictionarySpeechIdentifier
      isTtsPlaying = false
      isTtsPaused = false
      ttsAudioPlayer = nil
      ttsAudioData = nil
      activeDictionarySpeechIdentifier = nil
      updateListenButtonLoading(id, isLoading: false)
      showToolbarError(.tts, KeyboardErrorCatalog.noAudio)
      applyToolbarTheme()
    } else if player === sttPreviewPlayer {
      devLog("[STT] ✗ Preview decode error: %@", error?.localizedDescription ?? "unknown")
      isSttPreviewPlaying = false
      sttPreviewPlayer = nil
      showToolbarError(.stt, KeyboardErrorCatalog.playbackFailed)
    }
  }
}
