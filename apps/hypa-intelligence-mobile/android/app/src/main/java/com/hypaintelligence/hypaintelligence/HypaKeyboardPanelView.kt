package com.hypaintelligence.hypaintelligence

import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.media.SoundPool
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.util.Log
import android.util.TypedValue
import org.json.JSONArray
import com.hypaintelligence.hypaintelligence.storage.HypaKeyboardClipStore
import com.hypaintelligence.hypaintelligence.storage.KeyboardClip
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.widget.PopupWindow
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit
import com.hypaintelligence.hypaintelligence.context.ContextEngine
import com.hypaintelligence.hypaintelligence.context.CursorContext
import com.hypaintelligence.hypaintelligence.correction.AppliedCorrection
import com.hypaintelligence.hypaintelligence.correction.AutocorrectEngine
import com.hypaintelligence.hypaintelligence.correction.BlockCorrector
import com.hypaintelligence.hypaintelligence.correction.CorrectionAction
import com.hypaintelligence.hypaintelligence.correction.CorrectionDecision
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import com.hypaintelligence.hypaintelligence.correction.CorrectionLedger
import com.hypaintelligence.hypaintelligence.correction.WordDiff
import com.hypaintelligence.hypaintelligence.debug.TypingJankMonitor
import com.hypaintelligence.hypaintelligence.emoji.GraphemeText
import com.hypaintelligence.hypaintelligence.emoji.EmojiEntry
import com.hypaintelligence.hypaintelligence.emoji.EmojiGridAdapter
import com.hypaintelligence.hypaintelligence.emoji.EmojiRepository
import com.hypaintelligence.hypaintelligence.emoji.RecentEmojiStore
import com.hypaintelligence.hypaintelligence.modes.HypaApi
import com.hypaintelligence.hypaintelligence.modes.dictionary.DictionaryDefinitionItem
import com.hypaintelligence.hypaintelligence.modes.dictionary.DictionaryResultCardData
import com.hypaintelligence.hypaintelligence.modes.dictionary.DictionaryService
import com.hypaintelligence.hypaintelligence.modes.dictionary.DictionaryUsageItem
import com.hypaintelligence.hypaintelligence.modes.translate.ExplainableTranslation
import com.hypaintelligence.hypaintelligence.modes.translate.LastTranslationState
import com.hypaintelligence.hypaintelligence.modes.translate.TranslationService
import com.hypaintelligence.hypaintelligence.input.KeyboardActionEngine
import com.hypaintelligence.hypaintelligence.input.KeyboardActionResult
import com.hypaintelligence.hypaintelligence.input.KeyboardTextEngine
import com.hypaintelligence.hypaintelligence.input.KeyboardTypingEngine
import com.hypaintelligence.hypaintelligence.input.ShiftState
import com.hypaintelligence.hypaintelligence.input.keyCodeOf
import com.hypaintelligence.hypaintelligence.input.twoInitialCapsFix
import com.hypaintelligence.hypaintelligence.neural.DeviceCapability
import com.hypaintelligence.hypaintelligence.neural.TinyKeysService
import com.hypaintelligence.hypaintelligence.permissions.MicPermissionActivity
import com.hypaintelligence.hypaintelligence.prediction.CorpusProvider
import com.hypaintelligence.hypaintelligence.prediction.FuzzyProvider
import com.hypaintelligence.hypaintelligence.prediction.InferenceScheduler
import com.hypaintelligence.hypaintelligence.prediction.PersonalProvider
import com.hypaintelligence.hypaintelligence.prediction.PredictionMode
import com.hypaintelligence.hypaintelligence.prediction.PredictionOrchestrator
import com.hypaintelligence.hypaintelligence.prediction.SuggestionUiState
import com.hypaintelligence.hypaintelligence.storage.HypaKeyboardStore
import com.hypaintelligence.hypaintelligence.textdata.CorpusStore
import com.hypaintelligence.hypaintelligence.textdata.PersonalVocabulary
import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer
import com.hypaintelligence.hypaintelligence.ui.AudioWaveformView
import com.hypaintelligence.hypaintelligence.ui.KeyboardLayoutEngine
import com.hypaintelligence.hypaintelligence.ui.KeyboardRenderAction
import com.hypaintelligence.hypaintelligence.ui.KeyboardRenderBoard
import com.hypaintelligence.hypaintelligence.ui.KeyboardRenderKey
import com.hypaintelligence.hypaintelligence.ui.KeyboardRenderKeyType
import com.hypaintelligence.hypaintelligence.ui.KeyboardRenderModelEngine
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.roundToInt

private enum class ToolbarErrorSlot {
  MODE_BAR,
  CLIPBOARD,
  TRANSLATE,
  DICTIONARY,
  STT,
  TTS,
}

private enum class FeatureMode {
  KEYBOARD,
  TRANSLATE,
  TTS,
  TTS_LANGUAGE_PICKER,
  LANGUAGE_PICKER,
  THINKING_VIEW,
  DICTIONARY,
  DICTIONARY_LANGUAGE_PICKER,
  DICTIONARY_RESULT,
  KEYBOARD_LANGUAGE_PICKER,
  STT,
  STT_LANGUAGE_PICKER,
  CLIPBOARD,
  EMOJI,
  INFERENCE_DEBUG,
  TEXT_EDITING,
}

private enum class BoardKind {
  KEYS,
  TOOLS,
  CLIPBOARD,
  TEXT_EDITING,
}

private enum class PickerSearchScope {
  TRANSLATE_SOURCE,
  TRANSLATE_TARGET,
  TTS_LANGUAGE,
  TTS_VOICE,
  STT_LANGUAGE,
  DICTIONARY_LANGUAGE,
  EMOJI,
}

internal enum class KeyboardTool {
  TRANSLATE,
  VOICE,
  SPEAK,
  DICTIONARY,
  CLIPBOARD,
  TEXT_EDITING,
  LANGUAGES,
  EMOJI,
  SETTINGS,
}

private enum class SttConnState {
  IDLE,
  CONNECTING,
  CONNECTED,
  DISCONNECTING,
}

private data class VariantPopupSession(
  val popup: PopupWindow,
  val replacementText: String,
  val variants: List<String>,
  val buttons: List<TextView>,
  val restoresShiftOnCancel: Boolean,
  var selectedIndex: Int = -1,
)

private data class CursorOverlaySession(
  val popup: PopupWindow,
  val label: TextView,
)

class HypaKeyboardPanelView(
  context: Context,
  private val inputSupplier: () -> InputConnection?,
  private val onSearch: () -> Unit,
  private val onSurfaceColor: (Int) -> Unit = {},
  private val tinyKeys: TinyKeysService,
) : LinearLayout(context) {
  companion object {
    private const val TAG = "HypaKeyboardPanelView"
    private const val INFERENCE_DEBUG_TRIGGER = "@@@@??@"
    private const val HIT_SLOP_DEBUG_TRIGGER = "@@@@!!@"
    private const val SUGGESTION_SLOTS = 3
    private const val MAX_EMOJI_SUGGESTIONS = 3
    private const val MIN_EMOJI_WORD_CHARS = 3

    private val PREDICTION_MODE = PredictionMode.HYBRID
    private const val KEY_RADIUS_DP = 10f
    private const val KEY_ELEVATION_DP = 1f
    private const val TAP_CORE = 0.2f
    private const val TAP_REACH = 1f
    private const val TAP_SPREAD = 0.5f
    private const val TAP_PRIOR_WEIGHT = 0.8f
    private const val TAP_BAR_SHARE = 0.5f
    private const val TOOLBAR_HEIGHT_DP = 48
    private const val TOOLBAR_TOOL_COUNT = 4
    private const val TOOL_TILE_DP = 48
    private const val TOOL_LABEL_BLEED_DP = 16
    private const val SEARCH_TOOLBAR_HEIGHT_DP = 120
    private const val HAPTIC_THROTTLE_MS = 35L
    private const val MAX_STT_RECORD_MS = 30_000L
    private const val TTS_READ_TIMEOUT_SECONDS = 120L
    private const val MAX_EDITOR_TEXT_CHARS = 20_000

    private const val MAX_BLOCK_LOOKBACK_CHARS = 600

    private const val DOUBLE_SPACE_PERIOD_MS = 400L
    private const val SELECT_MULTI_TAP_MS = 450L

    private const val IDLE_BLOCK_CORRECTION_MS = 1000L

    private const val BLOCK_CORRECTION_CHAR_INTERVAL = 25

    private const val BOARD_SWAP_FADE_MS = 120L

    private const val TOOLBAR_ERROR_MS = 3500L
    private const val TOOLBAR_ERROR_COLOR = "#EF4444"

    private const val EMOJI_GRID_COLUMNS = 8
    private const val RECENT_CATEGORY_TITLE = "Recent"

    private const val EMOJI_VARIANT_COLUMNS = 6 
  }

  private val translationService = TranslationService()
  private val dictionaryService = DictionaryService()

  private val ttsHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(HypaApi.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(HypaApi.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(TTS_READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .build()
  }

  private var prefsListener: android.content.SharedPreferences.OnSharedPreferenceChangeListener? = null
  private var themeJson = HypaKeyboardStore.defaultSettingsJson()
  private var soundEnabled = true
  private var predictiveBarEnabled = true
  private var autocorrectEnabled = true
  val usesModel: Boolean
    get() = predictiveBarEnabled || autocorrectEnabled
  private var autoSpeakTranslationsKeyboard = false
  private var autoTranslateOnLanguageChange = true
  private var autoLookupOnLanguageChange = true
  private var showModeBarUntilNextTyping = false
  private val contextEngine = ContextEngine(inputSupplier)
  private val corpusStore = CorpusStore(context)
  private val personalVocabulary = PersonalVocabulary(context)
  private val autocorrectEngine = AutocorrectEngine(corpusStore, personalVocabulary)
  private val correctionLedger = CorrectionLedger()

  private val inferenceScheduler =
    InferenceScheduler(
      debounceMs = { DeviceCapability.debounceMs(context) },
      onSuperseded = { tinyKeys.cancel() },
    )
  private val blockCorrector =
    BlockCorrector(
      neural = tinyKeys,
      scheduler = inferenceScheduler,
      ledger = correctionLedger,
      onCorrected = { original, corrected -> offerBlockFix(original, corrected) },
    )
  private val predictionOrchestrator: PredictionOrchestrator =
    PredictionOrchestrator(
      neural = tinyKeys,
      scheduler = inferenceScheduler,
      providers =
        listOf(
          PersonalProvider(personalVocabulary),
          CorpusProvider(corpusStore, personalVocabulary),
          FuzzyProvider(
            corpusStore,
            personalVocabulary,
            onRepairsReady = { predictionOrchestrator.refresh() },
          ),
        ),
      maxSuggestions = SUGGESTION_SLOTS,
      mode = PREDICTION_MODE,
      isKnownWord = { corpusStore.isCommon(TextNormalizer.normalize(it)) || personalVocabulary.contains(it) },
      isDictionaryWord = { corpusStore.contains(TextNormalizer.normalize(it)) },
      emojisFor = ::emojiSuggestions,
      listener = { state -> onSuggestionsChanged(state) },
    )
  private var currentSuggestions = emptyList<String>()
  private var currentEmojis = emptyList<String>()
  private var shownSuggestions = emptyList<String>()
  private var modelSuggestions = emptySet<String>()
  private var blockFix: Pair<String, String>? = null
  private var debugTask = InferenceTask.PREDICT
  private var debugText = ""
  private var debugOutput = ""
  private var haptics = true
  private var vibrationStrength = 180
  private var fontSize = 15f
  private var keyboardHeightDp = 260f
  private var keyHeightDp = 38f
  private var keyTypeface: Typeface? = null
  private var userName = ""
  private var apiToken = ""
  private var translationProvider = KeyboardLanguageCatalog.defaultProviderName
  private var translationModel = KeyboardLanguageCatalog.defaultTranslationModelName
  private var dictionaryProvider = KeyboardLanguageCatalog.defaultProviderName
  private var dictionaryModel = KeyboardLanguageCatalog.defaultDictionaryModelName
  private var ttsProvider = KeyboardLanguageCatalog.defaultProviderName
  private var ttsModel = KeyboardLanguageCatalog.defaultTtsModelName
  private var sttProvider = KeyboardLanguageCatalog.defaultProviderName
  private var sttModel = KeyboardLanguageCatalog.defaultSttModelName
  private var ttsVoice = KeyboardLanguageCatalog.defaultVoice
  private var ttsLanguageCode = "en"
  private var sttLanguageCode = "auto"
  private var sttLanguageName = "Auto-Detect"
  private var keyboardLanguageCode = "en"
  private var longPressDurationMs = 500L
  private var usageWordsSaved = 0
  private var usageWordsTyped = 0
  private var usageStreakDays = 0
  private var usageLastActiveDate = ""
  private var usageStatsDirty = false
  private var streakSettledUntilMs = 0L
  private var lastSpaceCommitMs = 0L
  private var hasUndoableAutoPeriod = false
  private val emojiRepository = EmojiRepository(context)
  private val recentEmojiStore = RecentEmojiStore(context)
  private var emojiCategoryIndex = 0
  private var emojiVariantPopup: PopupWindow? = null

  private var charsSinceBlockCorrection = 0
  private val idleBlockCorrectionRunnable = Runnable { maybeCorrectBlock() }

  private val cachedColors = HashMap<String, Int>(16)
  private var cachedThemeObj: JSONObject? = null
  private var appearance = "system"
  private var cachedVibrator: Vibrator? = null
  private var cachedVibrationEffect: VibrationEffect? = null
  private var keySoundPool: SoundPool? = null
  private var keySoundId = 0
  private var isKeySoundLoaded = false
  private var lastHapticMs = 0L

  private val jankMonitor = TypingJankMonitor(this)

  private val letterKeyViews = mutableListOf<TextView>()

  private var predictionBarView: LinearLayout? = null
  private var shiftKeyView: ImageView? = null
  private var keyHeightPx = 0
  private var keyboardHeightPx = 0

  private var wsConnection: WebSocketClient? = null
  private var audioRecord: AudioRecord? = null
  private var audioThread: Thread? = null
  private var sttConnState: SttConnState = SttConnState.IDLE
  private var isSttListening = false
  private var sttShouldAutoStart = false
  private val startSttListeningRunnable = Runnable {
    if (featureMode == FeatureMode.STT) startSttListening()
  }
  private var sttMicButton: ImageView? = null
  private var sttLiveText: TextView? = null
  private var sttLiveMicBtn: FrameLayout? = null
  private var sttCapturedText = ""
  private var sttLastCommitted = ""
  private var sttPulseRunnable: Runnable? = null
  private var sttDebugMode = false
  private var sttSentLogView: TextView? = null
  private var sttRecvLogView: TextView? = null
  private val sttSentLog = mutableListOf<String>()
  private val sttRecvLog = mutableListOf<String>()

  private var isSttRecording = false
  private var isSttTranscribing = false
  private var sttRecorder: MediaRecorder? = null
  private var sttRecordedFile: java.io.File? = null
  private var sttRecordedAudioBytes: ByteArray? = null
  private var sttRecordStartMs: Long = 0L
  private var sttRecordDurationMs: Long = 0L
  private var sttRecordTickRunnable: Runnable? = null
  private var sttRecordTimerView: TextView? = null

  private var isAudioMenuOpen = false
  private var isToolsPanelOpen = false
  private var renderedBoardKind: BoardKind? = null
  private var toolOrder: List<KeyboardTool> = KeyboardTool.entries.toList()
  private var draggingTool: KeyboardTool? = null
  private var isClipboardEditMode = false
  private var isTextEditingSelectMode = false
  private var textEditingAnchor = -1
  private var textEditingSelectTapCount = 0
  private var textEditingLastSelectTapMs = 0L
  private var textEditingSelectionOrigin = -1
  private var textEditingSelectionDirectionChosen = false
  private var textEditingSnapshotHint: TextEditingDocumentSnapshot? = null
  private var textEditingSnapshotHintExpiresAt = 0L
  private var audioMenuPlayer: MediaPlayer? = null
  private var isAudioMenuPlaying = false
  private var sttWaveformView: AudioWaveformView? = null

  private var isTtsPlaying = false
  private var isTtsLoading = false
  private var isTtsPaused = false
  private var lastFailedTtsText = ""
  private var ttsPlayer: MediaPlayer? = null
  private var ttsButton: ImageView? = null
  private var ttsContainer: FrameLayout? = null
  private var lastTtsAudioFile: java.io.File? = null
  private var ttsSpinner: android.widget.ProgressBar? = null
  private var ttsWaveformView: AudioWaveformView? = null

  private val layoutEngine = KeyboardLayoutEngine()
  private val renderModelEngine = KeyboardRenderModelEngine(layoutEngine)
  private val typingEngine = KeyboardTypingEngine()
  private val actionEngine = KeyboardActionEngine(typingEngine)
  private val textEngine = KeyboardTextEngine(inputSupplier)
  private var featureMode = FeatureMode.KEYBOARD
  private var pickerSearchScope: PickerSearchScope? = null
  private var pickerSearchQuery = ""
  private var pickerSearchReturnMode: FeatureMode? = null
  private var preSearchSelectionStart = -1
  private var preSearchSelectionEnd = -1
  private val pickerSearchActive: Boolean get() = pickerSearchScope != null
  private val pickerScrollOffsets = mutableMapOf<String, Int>()
  private var sourceLanguageCode = "en"
  private var sourceLanguageName = "English"
  private var targetLanguageCode = "yo"
  private var targetLanguageName = "Yoruba"
  private var dictionaryLanguageCode = "en"
  private var dictionaryLanguageName = "English"
  private var selectingSourceLanguage = true
  private var isTranslating = false
  private var latestTranslationThinking: String? = null
  private var lastSentTranslationSourceText: String? = null
  private var lastExplainableTranslation: ExplainableTranslation? = null
  private var isTranslationThinkingLoading = false
  private var thinkingRequestGeneration = 0
  private var lastTranslationState: LastTranslationState? = null
  private var suppressTranslationUndoHostSyncUntil = 0L
  private var translationMutationGeneration = 0
  private var activeTranslationDocumentSnapshot: String? = null
  private var lastFailedTranslationSourceText = ""
  private var isDictionaryLoading = false
  private var lastSentDictionarySourceText: String? = null
  private val toolbarErrors = mutableMapOf<ToolbarErrorSlot, String>()
  private var latestDictionaryResult: DictionaryResultCardData? = null
  private var activeDictionarySpeechIdentifier: String? = null
  private var dictionaryLookupRequestId = 0
  private var ttsRequestId = 0
  private data class AlternateUnit(val text: String, val before: String, val after: String)
  private var recentAlternateUnit: AlternateUnit? = null
  private var hasSelection = false

  private val density = resources.displayMetrics.density
  private val mainHandler = Handler(Looper.getMainLooper())
  private val touchSlopPx = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
  private val containerPaddingPx = dp(6)
  private var bottomSystemInsetPx = 0
  private val flushUsageStatsRunnable =
    Runnable {
      flushUsageStats()
    }
  private var topAreaContainer: FrameLayout? = null
  private var contentContainer: FrameLayout? = null
  private var renderedTopAreaSignature: String? = null
  private var renderedContentSignature: String? = null
  private var activeVariantPopup: VariantPopupSession? = null
  private var boardRootView: LinearLayout? = null
  private val boardKeyViews = HashSet<View>()
  private val boardLetters = HashMap<View, String>()
  private var letterPriorKey: String? = null
  private var letterPrior: Map<String, Float> = emptyMap()
  private val tapRedirects = HashMap<View, View>()
  private var showHitSlopOverlay = false
  private val touchLocationBuffer = IntArray(2)
  private var keyPreview: KeyPreviewDrawable? = null
  private var keyPreviewOwner: View? = null
  private var isKeyPreviewShowing = false
  private val keyPreviewAnchorRect = Rect()
  private val keyPreviewLastBounds = Rect()
  private var cursorOverlayPopup: CursorOverlaySession? = null
  private fun sortedLanguages(languages: List<TranslationLanguage>): List<TranslationLanguage> =
    languages.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })

  private fun preferredLanguage(
    languages: List<TranslationLanguage>,
    preferredCode: String = "en",
  ): TranslationLanguage? =
    languages.firstOrNull { it.code.equals(preferredCode, ignoreCase = true) }
      ?: languages.firstOrNull()

  private fun supportedLanguages(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.languages(translationModel)

  private fun supportedSourceLanguages(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.translationSourceLanguages(translationModel)

  private fun supportedTargetLanguages(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.translationTargetLanguages(translationModel)

  private fun keyboardLanguageOptions(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.keyboardLayoutLanguages(translationModel)

  private fun currentDictionaryLanguages(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.dictionaryLanguages(dictionaryModel)

  private fun syncDictionaryLanguageToModel(preferredName: String? = null) {
    val languages = currentDictionaryLanguages()
    val fallbackLanguage =
      preferredLanguage(languages) ?: KeyboardLanguageCatalog.defaultDictionaryLanguage

    val preferred =
      preferredName?.trim()?.takeIf { it.isNotEmpty() }?.let { name ->
        resolveLanguageFromName(
          name = name,
          available = languages,
          fallback = fallbackLanguage,
          allowAutoDetect = false,
        )
      }

    if (preferred != null) {
      dictionaryLanguageCode = preferred.code
      dictionaryLanguageName = preferred.name
      return
    }

    val matchingLanguage =
      languages.firstOrNull {
        it.code.equals(dictionaryLanguageCode, ignoreCase = true) ||
          it.name.equals(dictionaryLanguageName, ignoreCase = true)
      }

    val resolvedLanguage = matchingLanguage ?: fallbackLanguage
    dictionaryLanguageCode = resolvedLanguage.code
    dictionaryLanguageName = resolvedLanguage.name
  }

  private fun resolveLanguageFromName(
    name: String,
    available: List<TranslationLanguage>,
    fallback: TranslationLanguage,
    allowAutoDetect: Boolean,
  ): TranslationLanguage {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return fallback

    if (
      allowAutoDetect &&
        (trimmed.equals(KeyboardLanguageCatalog.autoDetect.name, ignoreCase = true) ||
          trimmed.equals("Auto Detect", ignoreCase = true) ||
          trimmed.equals(KeyboardLanguageCatalog.autoDetect.code, ignoreCase = true))
    ) {
      return KeyboardLanguageCatalog.autoDetect
    }

    available
      .firstOrNull { it.name.equals(trimmed, ignoreCase = true) }
      ?.let {
        return it
      }

    val code = KeyboardLanguageCatalog.canonicalCode(trimmed)
    return available.firstOrNull { it.code.equals(code, ignoreCase = true) }
      ?: available.firstOrNull { it.code.equals(fallback.code, ignoreCase = true) }
      ?: available.firstOrNull()
      ?: fallback
  }

  private fun applySharedLanguageSettingsFromStorage(
    sourceName: String,
    targetName: String,
    dictionaryName: String,
  ) {
    val source =
      resolveLanguageFromName(
        name = sourceName,
        available = supportedSourceLanguages(),
        fallback = KeyboardLanguageCatalog.autoDetect,
        allowAutoDetect = true,
      )
    sourceLanguageCode = source.code
    sourceLanguageName = source.name

    val target =
      resolveLanguageFromName(
        name = targetName,
        available = supportedTargetLanguages(),
        fallback = KeyboardLanguageCatalog.defaultTargetLanguage,
        allowAutoDetect = false,
      )
    targetLanguageCode = target.code
    targetLanguageName = target.name

    syncDictionaryLanguageToModel(dictionaryName)
  }

  private fun parseToolOrder(raw: JSONArray?): List<KeyboardTool> {
    val stored =
      buildList {
        for (index in 0 until (raw?.length() ?: 0)) {
          val name = raw?.optString(index)?.trim().orEmpty()
          val tool = KeyboardTool.entries.firstOrNull { it.name.equals(name, ignoreCase = true) }
          if (tool != null && tool !in this) add(tool)
        }
      }
    return stored + KeyboardTool.entries.filter { it !in stored }
  }

  private fun persistToolOrder() {
    runCatching {
      val settings =
        runCatching { JSONObject(themeJson) }
          .getOrElse { JSONObject(HypaKeyboardStore.defaultSettingsJson()) }
      settings.put("toolOrder", JSONArray(toolOrder.map { it.name }))
      val updated = settings.toString()
      themeJson = updated
      HypaKeyboardStore.setSettingsJson(context, updated)
    }.onFailure {
      Log.w(TAG, "Failed to persist tool order", it)
    }
  }

  private fun persistSharedLanguageSettings(
    translateSourceName: String? = null,
    translateTargetName: String? = null,
    dictionaryLanguageNameValue: String? = null,
  ) {
    runCatching {
      val settings =
        runCatching { JSONObject(themeJson) }
          .getOrElse { JSONObject(HypaKeyboardStore.defaultSettingsJson()) }
      if (translateSourceName != null) {
        settings.put("translateSourceLanguage", translateSourceName)
      }
      if (translateTargetName != null) {
        settings.put("translateTargetLanguage", translateTargetName)
      }
      if (dictionaryLanguageNameValue != null) {
        settings.put("dictionaryLanguage", dictionaryLanguageNameValue)
      }
      val updated = settings.toString()
      themeJson = updated
      HypaKeyboardStore.setSettingsJson(context, updated)
    }.onFailure {
      Log.w(TAG, "Failed to persist shared language settings", it)
    }
  }

  private fun persistCurrentTranslateLanguages() {
    persistSharedLanguageSettings(
      translateSourceName = sourceLanguageName,
      translateTargetName = targetLanguageName,
    )
  }

  private fun persistCurrentDictionaryLanguage() {
    persistSharedLanguageSettings(dictionaryLanguageNameValue = dictionaryLanguageName)
  }

  init {
    orientation = VERTICAL
    applyContainerPadding()
    setOnApplyWindowInsetsListener { _, insets ->
      applyBottomSystemInset(insets)
      insets
    }
    loadSettings()
    loadFont()
    prepareKeySound()
    registerPrefs()
    rebuild()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    requestApplyInsets()
    loadSettings()
    prepareKeySound()
    if (prefsListener == null) registerPrefs()
    rebuild()
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    recentAlternateUnit = null
    prefsListener?.let { HypaKeyboardStore.prefs(context).unregisterOnSharedPreferenceChangeListener(it) }
    prefsListener = null
    dismissVariantPopup()
    discardKeyPreview()
    dismissEmojiVariantPopup()
    dismissCursorOverlay()
    cancelSttPulse()
    stopSttListening()
    abortSttRecording()
    stopAudioMenuPlayback()
    stopTts()
    releaseKeySound()
    flushUsageStats()
    jankMonitor.cancel()
    mainHandler.removeCallbacksAndMessages(null)
  }

  fun resetSessionState(preserveActiveMode: Boolean = false) {
    val preservedMode =
      featureMode.takeIf {
        preserveActiveMode &&
          (it == FeatureMode.TEXT_EDITING || it == FeatureMode.INFERENCE_DEBUG)
      }
    val previousVisualSignature = currentVisualSignature()
    stopSttListening()
    abortSttRecording()
    cancelSttAutoStart()
    stopAudioMenuPlayback()
    isAudioMenuOpen = false
    isToolsPanelOpen = false
    draggingTool = null
    isClipboardEditMode = false
    stopTts()
    sttCapturedText = ""
    sttLastCommitted = ""
    featureMode = preservedMode ?: FeatureMode.KEYBOARD
    isTextEditingSelectMode = false
    textEditingAnchor = -1
    textEditingSelectTapCount = 0
    textEditingLastSelectTapMs = 0L
    textEditingSelectionOrigin = -1
    textEditingSelectionDirectionChosen = false
    textEditingSnapshotHint = null
    textEditingSnapshotHintExpiresAt = 0L
    clearTranslationThinkingState()
    lastTranslationState = null
    isTranslating = false
    clearToolbarErrorTimers()
    activeTranslationDocumentSnapshot = null
    translationMutationGeneration += 1
    isDictionaryLoading = false
    latestDictionaryResult = null
    lastSentDictionarySourceText = null
    activeDictionarySpeechIdentifier = null
    dictionaryLookupRequestId += 1
    ttsRequestId += 1
    selectingSourceLanguage = true
    typingEngine.resetSessionState()
    typingEngine.updateAutoCaps(textBeforeCursor())
    predictionOrchestrator.reset()
    correctionLedger.reset()
    charsSinceBlockCorrection = 0
    lastSpaceCommitMs = 0L
    hasUndoableAutoPeriod = false
    mainHandler.removeCallbacks(idleBlockCorrectionRunnable)
    if (featureMode == FeatureMode.TEXT_EDITING || previousVisualSignature != currentVisualSignature()) {
      rebuild()
    } else {
      updateLetterKeyLabels()
    }
  }

  fun bindEditorInfo(info: EditorInfo?) {
    recentAlternateUnit = null
    contextEngine.bindEditorInfo(info)
    textEngine.bindEditorInfo(info)
    if (BuildConfig.DEBUG) {
      Log.d(
        TAG,
        "field pkg=${info?.packageName} inputType=0x${(info?.inputType ?: 0).toString(16)} " +
          "keyEvents=${textEngine.fieldTakesKeyEvents}",
      )
    }
    publishPredictionContext()
    val previousVisualSignature = currentVisualSignature()
    val previousEngineSignature =
      typingEngine.currentVisualSignature(
        featureMode.name,
        isAudioMenuOpen,
        apiToken.isNotBlank(),
        !latestTranslationThinking.isNullOrBlank(),
        isTranslating,
      )
    typingEngine.bindEditorInfo(info)
    typingEngine.updateAutoCaps(textBeforeCursor())
    if (
      previousEngineSignature !=
        typingEngine.currentVisualSignature(
          featureMode.name,
          isAudioMenuOpen,
          apiToken.isNotBlank(),
          !latestTranslationThinking.isNullOrBlank(),
          isTranslating,
        ) &&
      previousVisualSignature != currentVisualSignature()
    ) {
      rebuild()
    } else {
      updateLetterKeyLabels()
    }
  }

  fun bindSelection(selectionStart: Int, selectionEnd: Int) {
    if (contextEngine.onSelectionChanged(selectionStart, selectionEnd)) {
      recentAlternateUnit = null
      dismissVariantPopup()
      publishPredictionContext()
      hasUndoableAutoPeriod = false
    }
    val selected = selectionStart >= 0 && selectionEnd >= 0 && selectionStart != selectionEnd
    val selectionPresenceChanged = selected != hasSelection
    if (selectionPresenceChanged) {
      hasSelection = selected
    }
    val selectModeEnded = !selected && isTextEditingSelectMode
    if (selectModeEnded) {
      isTextEditingSelectMode = false
      textEditingAnchor = -1
      textEditingSelectTapCount = 0
      textEditingLastSelectTapMs = 0L
      textEditingSelectionOrigin = -1
      textEditingSelectionDirectionChosen = false
    }
    syncTranslationUndoWithHostDocument()
    refreshAutoCaps()
    if (featureMode == FeatureMode.TEXT_EDITING) {
      textEditingSnapshotHint = null
      textEditingSnapshotHintExpiresAt = 0L
      if (selectionPresenceChanged || selectModeEnded) rebuild()
    }
  }

  internal fun textEditingInputConnection(): android.view.inputmethod.InputConnection? = inputSupplier()
  internal fun textEditingSnapshot(): TextEditingDocumentSnapshot? {
    val input = inputSupplier() ?: return null
    textEditingSnapshotHint?.let { hint ->
      if (SystemClock.uptimeMillis() <= textEditingSnapshotHintExpiresAt) return hint
    }
    textEditingSnapshotHint = null

    val extracted = input.getExtractedText(ExtractedTextRequest(), 0)
    val extractedText = extracted?.text?.toString().orEmpty()
    if (extracted != null && extractedText.isNotEmpty()) {
      return TextEditingDocumentSnapshot(
        text = extractedText,
        selectionStart = extracted.selectionStart.coerceIn(0, extractedText.length),
        selectionEnd = extracted.selectionEnd.coerceIn(0, extractedText.length),
        startOffset = extracted.startOffset.coerceAtLeast(0),
      )
    }

    val before = input.getTextBeforeCursor(MAX_EDITOR_TEXT_CHARS, 0)?.toString()
    val selected = input.getSelectedText(0)?.toString()
    val after = input.getTextAfterCursor(MAX_EDITOR_TEXT_CHARS, 0)?.toString()
    if (before != null || selected != null || after != null) {
      val beforeText = before.orEmpty()
      val selectedText = selected.orEmpty()
      val surroundingText = beforeText + selectedText + after.orEmpty()
      if (surroundingText.isNotEmpty()) {
        return TextEditingDocumentSnapshot(
          text = surroundingText,
          selectionStart = beforeText.length,
          selectionEnd = beforeText.length + selectedText.length,
        )
      }
    }

    return extracted?.let { TextEditingDocumentSnapshot("", 0, 0) }
  }

  private fun rememberTextEditingSnapshot(snapshot: TextEditingDocumentSnapshot) {
    textEditingSnapshotHint = snapshot
    textEditingSnapshotHintExpiresAt = SystemClock.uptimeMillis() + 1_500L
  }

  internal fun textEditingDp(value: Int): Int = dp(value)
  internal fun textEditingColor(key: String, fallback: String): Int = color(key, fallback)
  internal fun textEditingTypeface(): Typeface? = keyTypeface
  internal fun textEditingPlayKeyFeedback() = pulse()
  internal fun textEditingRefreshAfterPaste() {
    listOf(0L, 60L, 180L).forEach { delayMs ->
      mainHandler.postDelayed(
        { if (featureMode == FeatureMode.TEXT_EDITING) rebuild() },
        delayMs,
      )
    }
  }
  internal fun textEditingHasClipboardText(): Boolean {
    return !textEditingClipboardText().isNullOrEmpty()
  }

  internal fun textEditingPasteClipboard() {
    val input = inputSupplier() ?: return
    val pasteText = textEditingClipboardText()?.takeUnless { it.isEmpty() } ?: return
    val previous = textEditingSnapshot()
    if (!input.commitText(pasteText, 1)) return

    val pasted = pasteText.toString()
    val nextSnapshot =
      if (previous != null) {
        val start = minOf(previous.selectionStart, previous.selectionEnd)
        val end = maxOf(previous.selectionStart, previous.selectionEnd)
        val nextText = previous.text.replaceRange(start, end, pasted)
        val caret = start + pasted.length
        previous.copy(text = nextText, selectionStart = caret, selectionEnd = caret)
      } else {
        TextEditingDocumentSnapshot(pasted, pasted.length, pasted.length)
      }
    rememberTextEditingSnapshot(nextSnapshot)
    textEditingFinishSelection(clearSnapshot = false)
    textEditingRefreshAfterPaste()
  }

  private fun textEditingClipboardText(): CharSequence? {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager
    val clip = manager?.primaryClip ?: return null
    return clip.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)
  }

  internal fun textEditingSelectMode(): Boolean = isTextEditingSelectMode
  internal fun textEditingToggleSelect() {
    val input = inputSupplier() ?: return
    val snapshot = textEditingSnapshot() ?: return
    val start = snapshot.selectionStart
    val end = snapshot.selectionEnd
    if (start < 0 || end < 0) return

    val now = SystemClock.uptimeMillis()
    val continuesMultiTap =
      isTextEditingSelectMode && now - textEditingLastSelectTapMs <= SELECT_MULTI_TAP_MS
    if (isTextEditingSelectMode && !continuesMultiTap) {
      val collapsed = end.coerceIn(0, snapshot.text.length)
      input.setSelection(snapshot.absoluteOffset(collapsed), snapshot.absoluteOffset(collapsed))
      isTextEditingSelectMode = false
      textEditingAnchor = -1
      textEditingSelectTapCount = 0
      textEditingLastSelectTapMs = 0L
      textEditingSelectionOrigin = -1
      textEditingSelectionDirectionChosen = false
      hasSelection = false
      rememberTextEditingSnapshot(
        snapshot.copy(selectionStart = collapsed, selectionEnd = collapsed),
      )
      rebuild()
      return
    }

    val text = snapshot.text
    if (!continuesMultiTap) {
      textEditingSelectTapCount = 1
      textEditingSelectionOrigin = end.coerceIn(0, text.length)
    } else {
      textEditingSelectTapCount = (textEditingSelectTapCount + 1).coerceAtMost(3)
    }
    textEditingLastSelectTapMs = now
    val selection =
      when (textEditingSelectTapCount) {
        1 ->
          if (start != end) TextSelectionRange(minOf(start, end), maxOf(start, end))
          else TextSelectionRanges.word(text, textEditingSelectionOrigin)
        2 -> TextSelectionRanges.line(text, textEditingSelectionOrigin)
        else -> TextSelectionRange(0, text.length)
      } ?: return
    if (
      !input.setSelection(
        snapshot.absoluteOffset(selection.start),
        snapshot.absoluteOffset(selection.end),
      )
    ) return
    textEditingAnchor = selection.start
    textEditingSelectionDirectionChosen = false
    isTextEditingSelectMode = true
    hasSelection = selection.start != selection.end
    rememberTextEditingSnapshot(
      snapshot.copy(selectionStart = selection.start, selectionEnd = selection.end),
    )
    rebuild()
  }

  internal fun textEditingMove(keyCode: Int) {
    val input = inputSupplier() ?: return
    val exitsSelectAll =
      isTextEditingSelectMode && textEditingAnchor < 0 && hasSelection
    if (exitsSelectAll) {
      isTextEditingSelectMode = false
      textEditingSelectTapCount = 0
      textEditingLastSelectTapMs = 0L
      textEditingSelectionOrigin = -1
      textEditingSelectionDirectionChosen = false
      hasSelection = false
    }
    textEditingSelectTapCount = 0
    textEditingLastSelectTapMs = 0L

    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
      val snapshot = textEditingSnapshot()
      if (snapshot != null) {
        val text = snapshot.text
        val start = snapshot.selectionStart.coerceIn(0, text.length)
        val end = snapshot.selectionEnd.coerceIn(0, text.length)
        if (isTextEditingSelectMode && textEditingAnchor >= 0) {
          val movingLeft = keyCode == KeyEvent.KEYCODE_DPAD_LEFT
          val directionAlreadyChosen = textEditingSelectionDirectionChosen
          val anchor =
            if (!directionAlreadyChosen) {
              (if (movingLeft) maxOf(start, end) else minOf(start, end)).also {
                textEditingAnchor = it
                textEditingSelectionDirectionChosen = true
              }
            } else {
              textEditingAnchor.coerceIn(0, text.length)
            }
          val focus =
            if (!directionAlreadyChosen) {
              if (movingLeft) minOf(start, end) else maxOf(start, end)
            } else if (start == anchor) {
              end
            } else {
              start
            }
          val next =
            if (movingLeft) {
              TextSelectionRanges.caretBefore(text, focus)
            } else {
              TextSelectionRanges.caretAfter(text, focus)
            }
          input.setSelection(snapshot.absoluteOffset(anchor), snapshot.absoluteOffset(next))
          rememberTextEditingSnapshot(snapshot.copy(selectionStart = anchor, selectionEnd = next))
        } else {
          val collapsedSelection = start != end
          val next =
            when {
              start != end && keyCode == KeyEvent.KEYCODE_DPAD_LEFT -> minOf(start, end)
              start != end -> maxOf(start, end)
              keyCode == KeyEvent.KEYCODE_DPAD_LEFT -> TextSelectionRanges.caretBefore(text, end)
              else -> TextSelectionRanges.caretAfter(text, end)
            }
          input.setSelection(snapshot.absoluteOffset(next), snapshot.absoluteOffset(next))
          rememberTextEditingSnapshot(snapshot.copy(selectionStart = next, selectionEnd = next))
          if (collapsedSelection) {
            hasSelection = false
            rebuild()
          }
        }
        return
      }
    }

    if (isTextEditingSelectMode && !textEditingSelectionDirectionChosen) {
      textEditingSnapshot()?.let { snapshot ->
        val movingBackward = keyCode == KeyEvent.KEYCODE_DPAD_UP
        val start = minOf(snapshot.selectionStart, snapshot.selectionEnd)
        val end = maxOf(snapshot.selectionStart, snapshot.selectionEnd)
        val anchor = if (movingBackward) end else start
        val focus = if (movingBackward) start else end
        textEditingAnchor = anchor
        textEditingSelectionDirectionChosen = true
        input.setSelection(snapshot.absoluteOffset(anchor), snapshot.absoluteOffset(focus))
      }
    }
    textEditingSnapshotHint = null
    textEditingSnapshotHintExpiresAt = 0L
    val metaState = if (isTextEditingSelectMode) KeyEvent.META_SHIFT_ON else 0
    input.sendKeyEvent(KeyEvent(0L, 0L, KeyEvent.ACTION_DOWN, keyCode, 0, metaState))
    input.sendKeyEvent(KeyEvent(0L, 0L, KeyEvent.ACTION_UP, keyCode, 0, metaState))
    if (exitsSelectAll) rebuild()
  }

  internal fun textEditingSetSelection(start: Int, end: Int) {
    val input = inputSupplier() ?: return
    val snapshot = textEditingSnapshot()
    if (snapshot == null) {
      input.setSelection(start, end)
      return
    }
    input.setSelection(snapshot.absoluteOffset(start), snapshot.absoluteOffset(end))
    val selectionPresenceChanged = hasSelection != (start != end)
    hasSelection = start != end
    rememberTextEditingSnapshot(
      snapshot.copy(
        selectionStart = start.coerceIn(0, snapshot.text.length),
        selectionEnd = end.coerceIn(0, snapshot.text.length),
      ),
    )
    if (selectionPresenceChanged) rebuild()
  }

  internal fun textEditingFinishSelection(clearSnapshot: Boolean = true) {
    isTextEditingSelectMode = false
    textEditingAnchor = -1
    textEditingSelectTapCount = 0
    textEditingLastSelectTapMs = 0L
    textEditingSelectionOrigin = -1
    textEditingSelectionDirectionChosen = false
    hasSelection = false
    if (clearSnapshot) {
      textEditingSnapshotHint = null
      textEditingSnapshotHintExpiresAt = 0L
    }
    rebuild()
  }

  internal fun textEditingSelectAll() {
    val input = inputSupplier() ?: return
    if (!input.performContextMenuAction(android.R.id.selectAll)) return
    hasSelection = true
    isTextEditingSelectMode = true
    textEditingAnchor = -1
    textEditingSelectTapCount = 0
    textEditingLastSelectTapMs = 0L
    textEditingSnapshotHint = null
    textEditingSnapshotHintExpiresAt = 0L
    rebuild()
    mainHandler.postDelayed({ if (featureMode == FeatureMode.TEXT_EDITING) rebuild() }, 60L)
  }

  private fun buildTextEditingBoard(): View = TextEditingPanelView(context, this)

  fun shutdownPrediction() {
    predictionOrchestrator.shutdown()
  }

  fun refreshSettings() {
    loadSettings()
    rebuild()
  }

  private fun loadFont() {
    keyTypeface =
      listOf("fonts/Inter_400Regular.ttf", "fonts/Outfit_400Regular.ttf")
        .firstNotNullOfOrNull { fontPath ->
          runCatching { Typeface.createFromAsset(context.assets, fontPath) }.getOrNull()
        } ?: Typeface.DEFAULT
  }

  private fun loadSettings() {
    themeJson = HypaKeyboardStore.getSettingsJson(context)
    cachedColors.clear()
    cachedThemeObj = null
    cachedVibrationEffect = null
    runCatching {
      val o = JSONObject(themeJson)
      soundEnabled = o.optBoolean("soundEnabled", true)
      predictiveBarEnabled = o.optBoolean("predictiveBarEnabled", true)
      autocorrectEnabled = o.optBoolean("autocorrectEnabled", true)
      autoSpeakTranslationsKeyboard =
        if (o.has("autoSpeakTranslationsKeyboard")) o.optBoolean("autoSpeakTranslationsKeyboard")
        else o.optBoolean("autoSpeakTranslations", false)
      autoTranslateOnLanguageChange = o.optBoolean("autoTranslateOnLanguageChange", true)
      autoLookupOnLanguageChange = o.optBoolean("autoLookupOnLanguageChange", true)
      haptics = o.optBoolean("hapticsEnabled", true)
      vibrationStrength = o.optInt("vibrationStrength", 180).coerceIn(1, 255)
      fontSize = o.optDouble("fontSize", 15.0).toFloat().coerceIn(12f, 32f)
      keyboardHeightDp = o.optDouble("keyboardHeight", 260.0).toFloat().coerceIn(220f, 420f)
      keyHeightDp = ((keyboardHeightDp - 92f) / 4f).coerceIn(34f, 64f)
      keyHeightPx = dp(keyHeightDp.roundToInt())
      keyboardHeightPx = dp(keyboardHeightDp.roundToInt())
      userName = o.optString("name", "").trim()
      apiToken = o.optString("token", "").trim()
      keyboardLanguageCode = o.optString("languageId", "en").trim().ifEmpty { "en" }
      keyboardLanguageCode = keyboardLanguageForCode(keyboardLanguageCode).code
      contextEngine.setLanguage(keyboardLanguageCode)
      corpusStore.setLanguage(keyboardLanguageCode)
      translationProvider =
        o.optString("translationProvider", KeyboardLanguageCatalog.defaultProviderName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultProviderName }
      longPressDurationMs = o.optLong("longPressDurationMs", 500L).coerceIn(150L, 500L)
      toolOrder = parseToolOrder(o.optJSONArray("toolOrder"))
      translationModel =
        o.optString("translationModel", KeyboardLanguageCatalog.defaultTranslationModelName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultTranslationModelName }
      dictionaryProvider =
        o.optString("dictionaryProvider", KeyboardLanguageCatalog.defaultProviderName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultProviderName }
      dictionaryModel =
        o.optString("dictionaryModel", KeyboardLanguageCatalog.defaultDictionaryModelName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultDictionaryModelName }
      ttsProvider =
        o.optString("ttsProvider", KeyboardLanguageCatalog.defaultProviderName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultProviderName }
      ttsModel =
        o.optString("ttsModel", KeyboardLanguageCatalog.defaultTtsModelName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultTtsModelName }
      sttProvider =
        o.optString("sttProvider", KeyboardLanguageCatalog.defaultProviderName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultProviderName }
      sttModel =
        o.optString("sttModel", KeyboardLanguageCatalog.defaultSttModelName).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultSttModelName }
      val resolvedTranslation =
        KeyboardLanguageCatalog.resolveTranslation(translationProvider, translationModel)
      translationProvider = resolvedTranslation.provider
      translationModel = resolvedTranslation.model
      val resolvedDictionary =
        KeyboardLanguageCatalog.resolveDictionary(dictionaryProvider, dictionaryModel)
      dictionaryProvider = resolvedDictionary.provider
      dictionaryModel = resolvedDictionary.model
      val resolvedTts = KeyboardLanguageCatalog.resolveTts(ttsProvider, ttsModel)
      ttsProvider = resolvedTts.provider
      ttsModel = resolvedTts.model
      val resolvedStt = KeyboardLanguageCatalog.resolveStt(sttProvider, sttModel)
      sttProvider = resolvedStt.provider
      sttModel = resolvedStt.model
      ttsVoice =
        o.optString("voice", KeyboardLanguageCatalog.defaultVoice).trim()
          .ifEmpty { KeyboardLanguageCatalog.defaultVoice }
      ttsLanguageCode =
        o.optString("ttsLanguage", "").trim().lowercase().ifEmpty {
          KeyboardLanguageCatalog.canonicalCode(keyboardLanguageCode).ifEmpty { "en" }
        }
      syncTtsSelectionsToModel(persist = true)
      val usageStats = o.optJSONObject("usageStats") ?: JSONObject()
      usageWordsSaved = usageStats.optInt("wordsSaved", 0)
      usageWordsTyped = usageStats.optInt("wordsTyped", 0)
      usageStreakDays = usageStats.optInt("streakDays", 0)
      usageLastActiveDate = usageStats.optString("lastActiveDate", "")
      usageStatsDirty = false
      appearance = o.optString("appearance", "system").lowercase()
      cachedThemeObj = activeThemeObject(o)
      val storedSourceName =
        o.optString(
          "translateSourceLanguage",
          KeyboardLanguageCatalog.autoDetect.name,
        )
      val storedTargetName =
        o.optString(
          "translateTargetLanguage",
          KeyboardLanguageCatalog.defaultTargetLanguage.name,
        )
      val storedDictionaryName =
        o.optString(
          "dictionaryLanguage",
          KeyboardLanguageCatalog.defaultDictionaryLanguage.name,
        )
      applySharedLanguageSettingsFromStorage(
        sourceName = storedSourceName,
        targetName = storedTargetName,
        dictionaryName = storedDictionaryName,
      )
      if (
        !sourceLanguageName.equals(storedSourceName, ignoreCase = true) ||
          !targetLanguageName.equals(storedTargetName, ignoreCase = true) ||
          !dictionaryLanguageName.equals(storedDictionaryName, ignoreCase = true)
      ) {
        persistSharedLanguageSettings(
          translateSourceName = sourceLanguageName,
          translateTargetName = targetLanguageName,
          dictionaryLanguageNameValue = dictionaryLanguageName,
        )
      }
      initVibrator()
    }
    invalidateRenderedKeyboard()
  }

  private fun invalidateRenderedKeyboard() {
    renderedTopAreaSignature = null
    renderedContentSignature = null
  }

  private fun initVibrator() {
    if (cachedVibrator != null) return
    cachedVibrator =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
  }

  private fun registerPrefs() {
    val listener =
      android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == HypaKeyboardStore.KEY_SETTINGS_JSON) {
          post {
            if (HypaKeyboardStore.getSettingsJson(context) == themeJson) {
              return@post
            }
            loadSettings()
            rebuild()
          }
        }
      }
    prefsListener = listener
    HypaKeyboardStore.prefs(context).registerOnSharedPreferenceChangeListener(listener)
  }

  private fun theme(): JSONObject =
    cachedThemeObj
      ?: (runCatching { activeThemeObject(JSONObject(themeJson)) }.getOrNull() ?: JSONObject())
        .also { cachedThemeObj = it }

  private fun activeThemeObject(settings: JSONObject): JSONObject? {
    val useLight =
      when (settings.optString("appearance", appearance).lowercase()) {
        "light" -> true
        "dark" -> false
        else -> !isDeviceInNightMode()
      }
    return settings.optJSONObject(if (useLight) "themeLight" else "themeDark")
  }

  private fun isDeviceInNightMode(): Boolean =
    (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES

  fun onDeviceAppearanceChanged() {
    if (appearance != "system") return
    cachedColors.clear()
    cachedThemeObj = null
    rebuild()
  }

  private val dayFormat by lazy { SimpleDateFormat("yyyy-MM-dd", Locale.US) }

  private fun todayKey(): String =
    dayFormat.format(Calendar.getInstance().time)

  private fun yesterdayKey(): String =
    Calendar.getInstance()
      .apply { add(Calendar.DAY_OF_YEAR, -1) }
      .let { dayFormat.format(it.time) }

  private fun nextMidnightMs(): Long =
    Calendar.getInstance()
      .apply {
        add(Calendar.DAY_OF_YEAR, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      .timeInMillis

  private fun updateUsageStats(
    onUpdate: () -> Boolean,
  ) {
    if (!onUpdate()) return
    usageStatsDirty = true
    scheduleUsageStatsFlush()
  }

  private fun scheduleUsageStatsFlush() {
    mainHandler.removeCallbacks(flushUsageStatsRunnable)
    mainHandler.postDelayed(flushUsageStatsRunnable, 600L)
  }

  private fun flushUsageStats() {
    if (!usageStatsDirty) return

    runCatching {
      val settingsJson = JSONObject(themeJson)
      settingsJson.put(
        "usageStats",
        JSONObject()
          .put("wordsSaved", usageWordsSaved)
          .put("wordsTyped", usageWordsTyped)
          .put("streakDays", usageStreakDays)
          .put("lastActiveDate", usageLastActiveDate),
      )
      val updated = settingsJson.toString()
      themeJson = updated
      usageStatsDirty = false
      HypaKeyboardStore.setSettingsJson(context, updated)
    }.onFailure {
      usageStatsDirty = true
    }
  }

  private fun recordTypingActivity() {
    if (System.currentTimeMillis() < streakSettledUntilMs) return
    streakSettledUntilMs = nextMidnightMs()

    val today = todayKey()
    val yesterday = yesterdayKey()

    updateUsageStats {
      val lastActiveDate = usageLastActiveDate
      val currentStreak = usageStreakDays

      if (lastActiveDate == today) {
        return@updateUsageStats false
      }

      val nextStreak =
        when {
          currentStreak <= 0 -> 1
          lastActiveDate == yesterday -> currentStreak + 1
          else -> 1
        }

      usageStreakDays = nextStreak
      usageLastActiveDate = today
      true
    }
  }

  private fun incrementWordsTyped() {
    updateUsageStats {
      usageWordsTyped += 1
      true
    }
  }

  private fun commitPeriodForDoubleSpace(): Boolean {
    val now = SystemClock.uptimeMillis()
    val wasDoubleTap = now - lastSpaceCommitMs <= DOUBLE_SPACE_PERIOD_MS
    lastSpaceCommitMs = now
    if (!wasDoubleTap) return false
    if (!typingEngine.allowsProseAssists) return false

    val input = inputSupplier() ?: return false
    val before = input.getTextBeforeCursor(2, 0)?.toString().orEmpty()
    if (before.length < 2 || before[1] != ' ') return false
    if (!before[0].isLetterOrDigit()) return false

    if (!textEngine.replaceSurroundingText(input, 1, 0, ". ")) return false
    lastSpaceCommitMs = 0L
    hasUndoableAutoPeriod = true
    correctionLedger.settle()
    contextEngine.applyDeletedBeforeCursor(1)
    contextEngine.applyInsertedText(". ")
    publishPredictionContext()
    charsSinceBlockCorrection += 1
    scheduleIdleBlockCorrection()
    return true
  }

  private fun commitTrackedText(
    text: String,
    countAsTyping: Boolean = false,
    countsCompletedWord: Boolean = false,
  ) {
    recentAlternateUnit = null
    val text = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFC)
    if (!textEngine.commitText(text)) return
    logHostEcho("commit '$text' viaKeyEvent=${textEngine.fieldTakesKeyEvents && keyCodeOf(text) != null}")
    if (openInferenceDebugIfTriggered(text)) return
    if (toggleHitSlopOverlayIfTriggered(text)) return
    correctionLedger.settle()
    hasUndoableAutoPeriod = false
    val discardedUndo = countAsTyping && discardTranslationUndo(refreshUi = false)
    contextEngine.applyInsertedText(text)
    publishPredictionContext()
    charsSinceBlockCorrection += text.length
    scheduleIdleBlockCorrection()
    val dismissedModeBar = predictiveBarEnabled && countAsTyping && showModeBarUntilNextTyping
    if (dismissedModeBar) showModeBarUntilNextTyping = false
    if (discardedUndo || dismissedModeBar) {
      mainHandler.post { rebuild() }
    }
    if (countAsTyping || countsCompletedWord) {
      mainHandler.post {
        if (countAsTyping) recordTypingActivity()
        if (countsCompletedWord) {
          incrementWordsTyped()
          fixTwoInitialCaps()
          if (text == " ") maybeAutocorrectCompletedWord() else learnCompletedWord()
        }
      }
    }
  }

  private fun logHostEcho(what: String) {
    if (!BuildConfig.DEBUG) return
    val now = inputSupplier()?.getTextBeforeCursor(32, 0)?.toString()
    mainHandler.postDelayed(
      {
        val later = inputSupplier()?.getTextBeforeCursor(32, 0)?.toString()
        Log.d(TAG, "$what now=[$now] after150ms=[$later]")
      },
      150,
    )
  }

  private fun undoAutoPeriod(): Boolean {
    hasUndoableAutoPeriod = false
    val input = inputSupplier() ?: return false
    if (input.getTextBeforeCursor(2, 0)?.toString() != ". ") return false
    if (!textEngine.replaceSurroundingText(input, 2, 0, " ")) return false
    contextEngine.resync()
    publishPredictionContext()
    return true
  }

  private fun deleteOneCharacterTracked() {
    val unit = recentAlternateUnit
    recentAlternateUnit = null
    val input = inputSupplier()
    if (unit != null && input != null && !hasSelection &&
      input.getSelectedText(0).isNullOrEmpty() &&
      input.getTextBeforeCursor(128, 0)?.toString() == unit.before &&
      input.getTextAfterCursor(128, 0)?.toString() == unit.after &&
      textEngine.deleteOneCharacter(unit.text.length, false)) {
      contextEngine.applyBackspace(unit.text.length)
      publishPredictionContext()
      scheduleIdleBlockCorrection()
      return
    }
    if (hasUndoableAutoPeriod && undoAutoPeriod()) return

    val undone = correctionLedger.rejectUndoable()
    if (undone != null && undoCorrection(undone)) {
      contextEngine.resync()
      publishPredictionContext()
      return
    }

    val units = contextEngine.lastGraphemeLength()
    textEngine.deleteOneCharacter(units, hasSelection)
    contextEngine.applyBackspace(units)
    publishPredictionContext()
    scheduleIdleBlockCorrection()
  }

  private fun publishPredictionContext() {
    if (showHitSlopOverlay) boardRootView?.invalidate()
    if (!predictiveBarEnabled) return
    if (blockFix != null) {
      blockFix = null
      renderTopArea()
    }
    val context = contextEngine.snapshot()
    if (!context.mode.allowsPrediction) {
      predictionOrchestrator.reset()
      applySuggestionState(emptyList(), emptyList())
      return
    }
    predictionOrchestrator.onContextChanged(context)
  }

  private fun fixTwoInitialCaps() {
    if (!typingEngine.allowsProseAssists) return
    val word = contextEngine.snapshot().previousWord
    val fixed = twoInitialCapsFix(word, layoutEngine.caseLocale(keyboardLanguageCode)) ?: return
    val input = inputSupplier() ?: return
    val typed = "$word "
    if (input.getTextBeforeCursor(typed.length, 0)?.toString() != typed) return
    if (!textEngine.replaceSurroundingText(input, typed.length, 0, "$fixed ")) return
    contextEngine.resync()
    publishPredictionContext()
  }

  private fun learnCompletedWord() {
    if (!contextEngine.contextMode.allowsLearning) return
    val snapshot = contextEngine.snapshot()
    val finished = snapshot.previousWord
    if (finished.isEmpty()) return
    personalVocabulary.record(previousWord = wordBefore(snapshot), word = finished)
  }

  private fun wordBefore(snapshot: CursorContext): String {
    val sentenceWords = snapshot.sentence.trim().split(' ')
    return sentenceWords.getOrNull(sentenceWords.size - 2).orEmpty()
  }

  private fun maybeAutocorrectCompletedWord() {
    val snapshot = contextEngine.snapshot()
    if (!snapshot.mode.allowsPrediction) {
      learnCompletedWord()
      return
    }
    val word = snapshot.previousWord
    if (word.isEmpty()) return

    val decision =
      if (autocorrectEnabled && !correctionLedger.isRejected(word)) {
        autocorrectEngine.evaluate(word, wordBefore(snapshot))
      } else {
        CorrectionDecision.keep(word)
      }
    val replacement =
      decision.replacement.takeIf { decision.action == CorrectionAction.AUTO_CORRECT }
        ?: modelWordCorrection(word)
    if (replacement != null) {
      if (textEngine.replaceRecentCommittedText("$word ", "$replacement ")) {
        correctionLedger.recordWordCorrection(original = word, replacement = replacement)
        contextEngine.resync()
        publishPredictionContext()
        return
      }
    }
    learnCompletedWord()
  }

  private fun modelWordCorrection(word: String): String? {
    if (!autocorrectEnabled || word.length < 3 || correctionLedger.isRejected(word)) return null
    if (personalVocabulary.contains(word) || corpusStore.contains(TextNormalizer.normalize(word))) return null
    if (AutocorrectEngine.hasApostropheEnding(word)) return null
    return predictionOrchestrator.modelCorrection(word)
  }

  private fun maybeCorrectBlock() {
    if (!(predictiveBarEnabled || autocorrectEnabled) || PREDICTION_MODE == PredictionMode.LOCAL_ONLY) return
    if (charsSinceBlockCorrection < BLOCK_CORRECTION_CHAR_INTERVAL) return

    if (correctionLedger.undoable != null) return

    val snapshot = contextEngine.snapshot()
    if (!snapshot.mode.allowsPrediction || snapshot.currentWord.isNotEmpty()) return

    charsSinceBlockCorrection = 0
    blockCorrector.correct(ContextEngine.sentenceOf(snapshot.textBeforeCursor))
  }

  private fun scheduleIdleBlockCorrection() {
    if (!(predictiveBarEnabled || autocorrectEnabled) || PREDICTION_MODE == PredictionMode.LOCAL_ONLY) return
    mainHandler.removeCallbacks(idleBlockCorrectionRunnable)
    mainHandler.postDelayed(idleBlockCorrectionRunnable, IDLE_BLOCK_CORRECTION_MS)
  }

  private fun offerBlockFix(original: String, corrected: String) {
    val snapshot = contextEngine.snapshot()
    if (snapshot.currentWord.isNotEmpty() || correctionLedger.undoable != null) return
    if (ContextEngine.sentenceOf(snapshot.textBeforeCursor).trim() != original) return
    val changes = WordDiff.changes(original, corrected)
    val churn = changes.sumOf { it.from.size + it.to.size }
    if (changes.isEmpty() || churn > WordDiff.words(original).size) return
    if (changes.any { change -> change.from.any(correctionLedger::isRejected) }) return
    if (autocorrectEnabled && changes.all(WordDiff::isSmallFix)) {
      applyBlockCorrection(original, corrected)
      return
    }
    if (!predictiveBarEnabled) return
    blockFix = original to corrected
    renderTopArea()
  }

  private fun buildBlockFixBar(original: String, corrected: String): LinearLayout {
    val label = color("label", "#EAEAEE")
    val summary =
      WordDiff.changes(original, corrected).joinToString("  ·  ") { change ->
        when {
          change.from.isEmpty() -> "+ " + change.to.joinToString(" ")
          change.to.isEmpty() -> "− " + change.from.joinToString(" ")
          else -> change.from.joinToString(" ") + " → " + change.to.joinToString(" ")
        }
      }
    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        TextView(context).apply {
          text = summary
          setTextColor(label)
          textSize = (fontSize - 2f).coerceAtLeast(11f)
          typeface = keyTypeface
          gravity = Gravity.CENTER_VERTICAL
          maxLines = 1
          ellipsize = TextUtils.TruncateAt.END
          compoundDrawablePadding = dp(6)
          setCompoundDrawablesRelative(modelDot(), null, null, null)
          setPadding(dp(8), dp(5), dp(8), dp(5))
          layoutParams = LayoutParams(0, dp(34), 1f)
          setOnTouchListener(TapTouch {
            blockFix = null
            applyBlockCorrection(original, corrected)
            renderTopArea()
          })
        },
      )
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_close,
          contentDescriptionText = "Dismiss correction",
          bg = Color.TRANSPARENT,
          tint = label,
        ) {
          blockFix = null
          renderTopArea()
        },
      )
    }
  }

  private fun applyBlockCorrection(original: String, corrected: String) {
    val input = inputSupplier() ?: return
    val before = input.getTextBeforeCursor(MAX_BLOCK_LOOKBACK_CHARS, 0)?.toString().orEmpty()
    val at = before.lastIndexOf(original)
    if (at < 0) return

    val tail = before.substring(at + original.length)
    if (!textEngine.replaceSurroundingText(input, before.length - at, 0, corrected + tail)) return
    correctionLedger.recordWordCorrection(original = original, replacement = corrected)
    contextEngine.resync()
    publishPredictionContext()
  }

  private fun undoCorrection(applied: AppliedCorrection): Boolean {
    val input = inputSupplier() ?: return false
    val before = input.getTextBeforeCursor(MAX_BLOCK_LOOKBACK_CHARS, 0)?.toString().orEmpty()
    val at = before.lastIndexOf(applied.replacement)
    if (at < 0) return false

    val tail = before.substring(at + applied.replacement.length)
    return textEngine.replaceSurroundingText(
      input,
      before.length - at,
      0,
      applied.original + tail,
    )
  }

  private fun consumeTrigger(committed: String, trigger: String): Boolean {
    if (!(contextEngine.snapshot().textBeforeCursor + committed).endsWith(trigger)) return false
    val input = inputSupplier() ?: return false
    input.deleteSurroundingText(trigger.length, 0)
    contextEngine.applyDeletedBeforeCursor(trigger.length - committed.length)
    return true
  }

  private fun openInferenceDebugIfTriggered(committed: String): Boolean {
    if (!consumeTrigger(committed, INFERENCE_DEBUG_TRIGGER)) return false

    debugText = readDebugTextFromField()
    debugOutput = ""
    featureMode = FeatureMode.INFERENCE_DEBUG
    rebuild()
    return true
  }

  private fun toggleHitSlopOverlayIfTriggered(committed: String): Boolean {
    if (!BuildConfig.DEBUG) return false
    if (!consumeTrigger(committed, HIT_SLOP_DEBUG_TRIGGER)) return false
    showHitSlopOverlay = !showHitSlopOverlay
    rebuild()
    return true
  }

  private fun readDebugTextFromField(): String =
    inputSupplier()?.getTextBeforeCursor(512, 0)?.toString().orEmpty()

  private fun buildDebugRequest(): InferenceRequest =
    when (debugTask) {
      InferenceTask.PREDICT ->
        InferenceRequest(task = debugTask, input = ContextEngine.sentenceOf(debugText))
      InferenceTask.CORRECT ->
        InferenceRequest(
          task = debugTask,
          input = debugText.trimEnd().takeLastWhile { it.isLetter() || it == '\'' },
        )
      InferenceTask.CORRECT_BLOCK,
      InferenceTask.GRAMMAR -> InferenceRequest(task = debugTask, input = debugText.trim())
    }

  private fun runInferenceDebug() {
    val request = buildDebugRequest()
    debugOutput = "Running…"
    rebuild()
    KeyboardThreads.compute("hypa-model-debug").newThread {
        val startedAt = System.currentTimeMillis()
        tinyKeys.load()
        val output =
          when (request.task) {
            InferenceTask.PREDICT -> tinyKeys.predict(request.input).joinToString("   ·   ")
            InferenceTask.CORRECT -> tinyKeys.correct(request.input).joinToString("   ·   ")
            InferenceTask.CORRECT_BLOCK -> tinyKeys.correctBlock(request.input)
            InferenceTask.GRAMMAR -> tinyKeys.grammar(request.input)
          }
        val elapsed = System.currentTimeMillis() - startedAt
        mainHandler.post {
          debugOutput = "out: ${output?.ifEmpty { null } ?: "(none)"}\n\n${elapsed}ms"
          if (featureMode == FeatureMode.INFERENCE_DEBUG) rebuild()
        }
      }
      .start()
  }

  private fun color(key: String, fallback: String): Int =
    cachedColors.getOrPut(key) {
      val raw = theme().optString(key, fallback).trim().ifBlank { fallback }
      runCatching { Color.parseColor(raw) }.getOrDefault(Color.parseColor(fallback))
    }

  private fun dp(v: Int): Int = (v * density).roundToInt()

  private fun applyContainerPadding() {
    setPadding(
      containerPaddingPx,
      containerPaddingPx,
      containerPaddingPx,
      containerPaddingPx + bottomSystemInsetPx,
    )
  }

  private fun applyBottomSystemInset(insets: WindowInsets?) {
    val bottomInset =
      when {
        insets == null -> 0
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
          insets.getInsets(WindowInsets.Type.navigationBars()).bottom
        else -> {
          @Suppress("DEPRECATION")
          insets.systemWindowInsetBottom
        }
      }

    if (bottomInset == bottomSystemInsetPx) return
    bottomSystemInsetPx = bottomInset
    applyContainerPadding()
    requestLayout()
    post { rebuild() }
  }

  private fun totalKeyboardHeightPx(): Int = keyboardHeightPx + bottomSystemInsetPx

  private fun roundedBg(fill: Int, radiusDp: Float = 8f): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = radiusDp * density
      setColor(fill)
    }

  private fun pressableKeyBg(fill: Int, radiusDp: Float = 8f): StateListDrawable =
    StateListDrawable().apply {
      addState(intArrayOf(android.R.attr.state_pressed), roundedBg(color("keyPressed", "#38383E"), radiusDp))
      addState(IntArray(0), roundedBg(fill, radiusDp))
    }

  private fun currentVisualSignature(): String =
    typingEngine.currentVisualSignature(
      featureModeName = featureMode.name,
      isAudioMenuOpen = isAudioMenuOpen,
      hasAuthToken = apiToken.isNotBlank(),
      hasThinkingTrace = !latestTranslationThinking.isNullOrBlank(),
      isTranslating = isTranslating,
    )

  private fun currentTopAreaSignature(): String =
    buildString(96) {
      append(featureMode.name)
      append('|')
      append(pickerSearchScope?.name.orEmpty())
      append('|')
      append(pickerSearchQuery)
      append('|')
      append(isAudioMenuOpen)
      append('|')
      append(isToolsPanelOpen)
      append('|')
      append(toolOrder.take(TOOLBAR_TOOL_COUNT).joinToString(","))
      append('|')
      append(isClipboardEditMode)
      append('|')
      append(apiToken.isNotBlank())
      append('|')
      append(!latestTranslationThinking.isNullOrBlank())
      append('|')
      append(isTranslating)
      append('|')
      append(isDictionaryLoading)
      append('|')
      append(isSttRecording)
      append('|')
      append(isSttTranscribing)
      append('|')
      append(hasSttRecordedAudio())
      append('|')
      append(isAudioMenuPlaying)
      append('|')
      append(isTtsPlaying)
      append('|')
      append(isTtsLoading)
      append('|')
      append(isTtsPaused)
      append('|')
      append(predictiveBarEnabled)
      append('|')
      append(showModeBarUntilNextTyping)
      append('|')
      append(hasSuggestions())
      append('|')
      append(blockFix != null)
      append('|')
      append(sourceLanguageCode)
      append('|')
      append(targetLanguageCode)
      append('|')
      append(toolbarErrors)
      append('|')
      append(lastTranslationState != null)
    }

  private fun currentContentSignature(): String =
    buildString(96) {
      append(featureMode.name)
      append('|')
      append(actionEngine.keyboardBoardMode().name)
      append('|')
      append(isToolsPanelOpen)
      append('|')
      append(toolOrder.joinToString(","))
      append('|')
      append(isClipboardEditMode)
      append('|')
      append(if (featureMode == FeatureMode.TEXT_EDITING) hasSelection else false)
      append('|')
      append(if (featureMode == FeatureMode.TEXT_EDITING) isTextEditingSelectMode else false)
      append('|')
      append(if (featureMode == FeatureMode.CLIPBOARD) HypaKeyboardClipStore.revision else 0)
      append('|')
      append(typingEngine.symbolPage)
      append('|')
      append(typingEngine.forceEmail)
      append('|')
      append(keyboardLanguageCode)
      append('|')
      append(sourceLanguageCode)
      append('|')
      append(targetLanguageCode)
      append('|')
      append(!latestTranslationThinking.isNullOrBlank())
      append('|')
      append(isSttRecording)
      append('|')
      append(isSttTranscribing)
      append('|')
      append(hasSttRecordedAudio())
      append('|')
      append(isAudioMenuPlaying)
    }

  private fun beginPickerSearch(scope: PickerSearchScope, returnMode: FeatureMode) {
    val extracted = inputSupplier()?.getExtractedText(android.view.inputmethod.ExtractedTextRequest(), 0)
    val offset = if (scope == PickerSearchScope.EMOJI) extracted?.startOffset ?: 0 else 0
    preSearchSelectionStart = extracted?.selectionStart?.takeIf { it >= 0 }?.plus(offset) ?: -1
    preSearchSelectionEnd = extracted?.selectionEnd?.takeIf { it >= 0 }?.plus(offset) ?: -1
    if (scope != PickerSearchScope.EMOJI ||
      (preSearchSelectionStart >= 0 && preSearchSelectionEnd >= 0)) {
      inputSupplier()?.setSelection(0, 0)
    }

    pickerSearchScope = scope
    pickerSearchQuery = ""
    pickerSearchReturnMode = returnMode
    if (scope == PickerSearchScope.EMOJI) actionEngine.returnToAlphabet()
    featureMode = normalModeForPicker(returnMode)
    rebuild()
  }

  private fun normalModeForPicker(pickerMode: FeatureMode): FeatureMode {
    return FeatureMode.KEYBOARD
  }

  private fun closePickerSearch(overrideReturnMode: FeatureMode? = null) {
    if (preSearchSelectionStart >= 0 && preSearchSelectionEnd >= 0) {
      inputSupplier()?.setSelection(preSearchSelectionStart, preSearchSelectionEnd)
      preSearchSelectionStart = -1
      preSearchSelectionEnd = -1
    }
    featureMode = overrideReturnMode ?: pickerSearchReturnMode ?: FeatureMode.KEYBOARD
    pickerSearchScope = null
    pickerSearchQuery = ""
    pickerSearchReturnMode = null
    rebuild()
  }

  private fun pickerSearchOptions(): List<Pair<String, String>> {
    return when (pickerSearchScope) {
      PickerSearchScope.TRANSLATE_SOURCE -> supportedSourceLanguages().map { it.name to it.code }
      PickerSearchScope.TRANSLATE_TARGET -> supportedTargetLanguages().map { it.name to it.code }
      PickerSearchScope.TTS_LANGUAGE -> ttsLanguagesForModel().map { it.name to it.code }
      PickerSearchScope.TTS_VOICE -> ttsVoicesForLanguage().map { it to it }
      PickerSearchScope.STT_LANGUAGE -> sttLanguagesForModel().map { it.name to it.code }
      PickerSearchScope.DICTIONARY_LANGUAGE -> currentDictionaryLanguages().map { it.name to it.code }
      PickerSearchScope.EMOJI, null -> emptyList()
    }
  }

  private fun updatePickerSearchQuery(value: String) {
    if (!pickerSearchActive) return
    pickerSearchQuery += value
    renderTopArea()
  }

  private fun deletePickerSearchCharacter() {
    if (!pickerSearchActive || pickerSearchQuery.isEmpty()) return
    pickerSearchQuery = pickerSearchQuery.dropLast(1)
    renderTopArea()
  }

  private fun selectPickerSearchOption(value: String) {
    val returnMode = pickerSearchReturnMode
    val previousDictionaryLanguageCode = dictionaryLanguageCode
    when (pickerSearchScope) {
      PickerSearchScope.TRANSLATE_SOURCE -> {
        supportedSourceLanguages().firstOrNull { it.code.equals(value, ignoreCase = true) }?.let {
          if (it.code.equals(targetLanguageCode, ignoreCase = true)) {
             targetLanguageCode = sourceLanguageCode
             targetLanguageName = sourceLanguageName
          }
          sourceLanguageCode = it.code
          sourceLanguageName = it.name
          persistCurrentTranslateLanguages()
          discardTranslationUndo(refreshUi = false)
        }
      }
      PickerSearchScope.TRANSLATE_TARGET -> {
        supportedTargetLanguages().firstOrNull { it.code.equals(value, ignoreCase = true) }?.let {
          if (it.code.equals(sourceLanguageCode, ignoreCase = true)) {
             sourceLanguageCode = targetLanguageCode
             sourceLanguageName = targetLanguageName
          }
          targetLanguageCode = it.code
          targetLanguageName = it.name
          persistCurrentTranslateLanguages()
          discardTranslationUndo(refreshUi = false)
        }
      }
      PickerSearchScope.TTS_LANGUAGE -> {
        ttsLanguagesForModel().firstOrNull { it.code.equals(value, ignoreCase = true) }?.let {
          setTtsLanguage(it.code)
        }
      }
      PickerSearchScope.TTS_VOICE -> {
        setTtsVoice(value)
      }
      PickerSearchScope.STT_LANGUAGE -> {
        sttLanguagesForModel().firstOrNull { it.code.equals(value, ignoreCase = true) }?.let {
          setSttLanguage(it.code, it.name)
        }
      }
      PickerSearchScope.DICTIONARY_LANGUAGE -> {
        currentDictionaryLanguages().firstOrNull { it.code.equals(value, ignoreCase = true) }?.let {
          dictionaryLanguageCode = it.code
          dictionaryLanguageName = it.name
          persistCurrentDictionaryLanguage()
        }
      }
      PickerSearchScope.EMOJI -> {
        val input = inputSupplier() ?: return
        if (preSearchSelectionStart >= 0 && preSearchSelectionEnd >= 0) {
          if (!input.setSelection(preSearchSelectionStart, preSearchSelectionEnd)) return
        }
        preSearchSelectionStart = -1
        preSearchSelectionEnd = -1
        insertEmoji(value)
        return
      }
      null -> return
    }
    val scope = pickerSearchScope
    pickerSearchScope = null
    pickerSearchQuery = ""
    pickerSearchReturnMode = null
    
    if (preSearchSelectionStart >= 0 && preSearchSelectionEnd >= 0) {
      inputSupplier()?.setSelection(preSearchSelectionStart, preSearchSelectionEnd)
      preSearchSelectionStart = -1
      preSearchSelectionEnd = -1
    }

    featureMode = returnMode ?: FeatureMode.KEYBOARD
    rebuild(resetPickerScrollKeys = pickerScrollKeysToReset(scope))

    if (scope == PickerSearchScope.DICTIONARY_LANGUAGE) {
      autoLookupAfterDictionaryLanguageChange(previousDictionaryLanguageCode)
    }
  }

  private fun pickerScrollKeysToReset(scope: PickerSearchScope?): Set<String> {
    return when (scope) {
      PickerSearchScope.TRANSLATE_SOURCE -> setOf("translate-source")
      PickerSearchScope.TRANSLATE_TARGET -> setOf("translate-target")
      PickerSearchScope.TTS_LANGUAGE -> setOf("tts-language", "tts-voice")
      PickerSearchScope.TTS_VOICE -> setOf("tts-voice")
      PickerSearchScope.STT_LANGUAGE -> setOf("stt-language")
      PickerSearchScope.DICTIONARY_LANGUAGE -> setOf("dictionary-language")
      PickerSearchScope.EMOJI, null -> emptySet()
    }
  }

  private fun pickerSearchOwner(): ToolbarErrorSlot? =
    when (pickerSearchScope) {
      PickerSearchScope.TRANSLATE_SOURCE,
      PickerSearchScope.TRANSLATE_TARGET,
      -> ToolbarErrorSlot.TRANSLATE
      PickerSearchScope.DICTIONARY_LANGUAGE -> ToolbarErrorSlot.DICTIONARY
      PickerSearchScope.TTS_LANGUAGE,
      PickerSearchScope.TTS_VOICE,
      -> ToolbarErrorSlot.TTS
      PickerSearchScope.STT_LANGUAGE -> ToolbarErrorSlot.STT
      PickerSearchScope.EMOJI, null -> null
    }

  private fun clearToolbarErrorTimers() {
    ToolbarErrorSlot.entries.forEach { mainHandler.removeCallbacksAndMessages(it) }
    toolbarErrors.clear()
  }

  private fun toolbarError(slot: ToolbarErrorSlot): String? = toolbarErrors[slot]

  private fun clearToolbarError(slot: ToolbarErrorSlot) {
    mainHandler.removeCallbacksAndMessages(slot)
    toolbarErrors.remove(slot)
  }

  private fun closePickerSearchForError(slot: ToolbarErrorSlot) {
    if (slot == ToolbarErrorSlot.STT) {
      isAudioMenuOpen = true
      closePickerSearch(FeatureMode.KEYBOARD)
      return
    }
    val headerMode =
      when (slot) {
        ToolbarErrorSlot.MODE_BAR -> FeatureMode.KEYBOARD
        ToolbarErrorSlot.CLIPBOARD -> FeatureMode.CLIPBOARD
        ToolbarErrorSlot.TRANSLATE -> FeatureMode.TRANSLATE
        ToolbarErrorSlot.DICTIONARY -> FeatureMode.DICTIONARY
        ToolbarErrorSlot.TTS -> FeatureMode.TTS
        ToolbarErrorSlot.STT -> FeatureMode.STT
      }
    closePickerSearch(headerMode)
  }

  private fun showToolbarError(slot: ToolbarErrorSlot, message: String) {
    val closeSearch = pickerSearchOwner() == slot
    toolbarErrors[slot] = message
    mainHandler.removeCallbacksAndMessages(slot)
    mainHandler.postAtTime(
      {
        toolbarErrors.remove(slot)
        rebuild()
      },
      slot,
      SystemClock.uptimeMillis() + TOOLBAR_ERROR_MS,
    )
    if (closeSearch) {
      closePickerSearchForError(slot)
      return
    }
    if (slot == ToolbarErrorSlot.STT && featureMode == FeatureMode.STT && bindSttLiveError(message)) {
      return
    }
    rebuild()
  }

  private fun dismissToolbarError(slot: ToolbarErrorSlot) {
    mainHandler.removeCallbacksAndMessages(slot)
    if (toolbarErrors.remove(slot) != null) rebuild()
  }

  private fun inlineToolbarErrorLabel(message: String, onDismiss: () -> Unit): TextView =
    TextView(context).apply {
      text = "⚠ $message"
      setTextColor(Color.parseColor(TOOLBAR_ERROR_COLOR))
      textSize = (fontSize - 2f).coerceAtLeast(11f)
      typeface = keyTypeface
      gravity = Gravity.CENTER
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      layoutParams = LayoutParams(0, LayoutParams.MATCH_PARENT, 1f)
      isClickable = true
      isFocusable = true
      setOnTouchListener(TapTouch { onDismiss() })
    }

  private fun rebuild(resetPickerScrollKeys: Set<String> = emptySet()) {
    dismissVariantPopup()
    dismissEmojiVariantPopup()
    dismissCursorOverlay()
    cancelSttPulse()
    if (isPickerFeatureMode() && childCount > 0) {
      capturePickerScrollOffsets(getChildAt(0))
      resetPickerScrollKeys.forEach { pickerScrollOffsets.remove(it) }
    }
    val surface = color("surface", "#121214")
    setBackgroundColor(surface)
    onSurfaceColor(surface)
    minimumHeight = totalKeyboardHeightPx()
    if (isFullscreenFeatureMode()) {
      renderFullscreenContent()
      return
    }

    ensureKeyboardContainers()

    val nextTopSignature = currentTopAreaSignature()
    if (nextTopSignature != renderedTopAreaSignature) {
      renderTopArea()
      renderedTopAreaSignature = nextTopSignature
    }

    val nextContentSignature = currentContentSignature()
    if (nextContentSignature != renderedContentSignature) {
      renderBoardContent()
      renderedContentSignature = nextContentSignature
    }
  }

  private fun isPickerFeatureMode(): Boolean =
    featureMode == FeatureMode.LANGUAGE_PICKER ||
      featureMode == FeatureMode.TTS_LANGUAGE_PICKER ||
      featureMode == FeatureMode.DICTIONARY_LANGUAGE_PICKER ||
      featureMode == FeatureMode.KEYBOARD_LANGUAGE_PICKER ||
      featureMode == FeatureMode.STT_LANGUAGE_PICKER

  private fun capturePickerScrollOffsets(root: View) {
    when (root) {
      is ScrollView -> {
        val key = root.tag as? String
        if (key != null && key.startsWith("picker-scroll:")) {
          pickerScrollOffsets[key.removePrefix("picker-scroll:")] = root.scrollY
        }
      }
    }
    if (root is ViewGroup) {
      for (index in 0 until root.childCount) {
        capturePickerScrollOffsets(root.getChildAt(index))
      }
    }
  }

  private fun bindPickerScroll(
    scroll: ScrollView,
    key: String,
    optionPrefix: String? = null,
    selectedValue: String? = null
  ) {
    scroll.tag = "picker-scroll:$key"
    val offset = pickerScrollOffsets[key]
    scroll.post {
      val contentHeight = scroll.getChildAt(0)?.height ?: 0
      val maxY = (contentHeight - scroll.height).coerceAtLeast(0)
      if (offset != null) {
        scroll.scrollTo(0, offset.coerceIn(0, maxY))
      } else if (optionPrefix != null && selectedValue != null) {
        val container = scroll.getChildAt(0) as? ViewGroup
        if (container != null) {
          var activeView: View? = null
          for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            val tag = child.tag as? String
            if (tag == "$optionPrefix$selectedValue") {
              activeView = child
              break
            }
          }
          if (activeView != null) {
            val y = activeView.top - scroll.height / 2 + activeView.height / 2
            scroll.scrollTo(0, y.coerceIn(0, maxY))
          }
        }
      }
    }
  }

  private fun refreshPickerOptionSelections(optionPrefix: String, selectedValue: String) {
    if (childCount == 0) return
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val selectedBg = color("pill", "#FFFFFF")
    val selectedLabel = color("pillLabel", "#111111")
    refreshPickerOptionSelections(
      getChildAt(0),
      optionPrefix,
      selectedValue,
      keyBg,
      label,
      selectedBg,
      selectedLabel,
    )
  }

  private fun refreshPickerOptionSelections(
    root: View,
    optionPrefix: String,
    selectedValue: String,
    keyBg: Int,
    label: Int,
    selectedBg: Int,
    selectedLabel: Int,
  ) {
    val tag = root.tag as? String
    if (tag != null && tag.startsWith(optionPrefix)) {
      val value = tag.removePrefix(optionPrefix)
      val selected = value.equals(selectedValue, ignoreCase = true)
      (root as? TextView)?.let { option ->
        option.background = roundedBg(if (selected) selectedBg else keyBg, 12f)
        option.setTextColor(if (selected) selectedLabel else label)
      }
    }
    if (root is ViewGroup) {
      for (index in 0 until root.childCount) {
        refreshPickerOptionSelections(
          root.getChildAt(index),
          optionPrefix,
          selectedValue,
          keyBg,
          label,
          selectedBg,
          selectedLabel,
        )
      }
    }
  }

  private fun refreshOpenPickerSelections() {
    when (featureMode) {
      FeatureMode.LANGUAGE_PICKER -> refreshTranslateLanguagePickerOptions()
      FeatureMode.TTS_LANGUAGE_PICKER -> {
        refreshPickerOptionSelections("picker-option:tts-language:", ttsLanguageCode)
        refreshPickerOptionSelections("picker-option:tts-voice:", resolvedTtsVoice())
      }
      FeatureMode.DICTIONARY_LANGUAGE_PICKER ->
        refreshPickerOptionSelections("picker-option:dictionary-language:", dictionaryLanguageCode)
      FeatureMode.KEYBOARD_LANGUAGE_PICKER ->
        refreshPickerOptionSelections(
          "picker-option:keyboard-language:",
          keyboardLanguageForCode(keyboardLanguageCode).code,
        )
      FeatureMode.STT_LANGUAGE_PICKER ->
        refreshPickerOptionSelections("picker-option:stt-language:", sttLanguageCode)
      else -> Unit
    }
  }

  private fun refreshTranslateLanguagePickerOptions() {
    if (childCount == 0) return
    val fg = color("label", "#EAEAEE")
    val keyBg = color("key", "#2C2C31")
    val selectedBg = color("pill", "#FFFFFF")
    val selectedLabel = color("pillLabel", "#111111")
    walkTranslateLanguagePickerOptions(getChildAt(0), fg, keyBg, selectedBg, selectedLabel)
    refreshTranslateSwapChip()
  }

  private fun refreshTranslateSwapChip() {
    if (childCount == 0) return
    (findViewWithTag("picker:translate-swap") as? View)?.let(::applyTranslateSwapChipState)
  }

  private fun applyTranslateSwapChipState(chip: View) {
    val enabled = canSwapTranslateLanguages()
    chip.alpha = if (enabled) 1f else 0.4f
    if (enabled) {
      chip.isClickable = true
      chip.setOnTouchListener(
        TapTouch(ignoreWhen = { isTranslating }) {
          if (!canSwapTranslateLanguages()) return@TapTouch
          swapTranslateLanguages(rebuildUi = false)
          featureMode = FeatureMode.LANGUAGE_PICKER
          refreshOpenPickerSelections()
        },
      )
    } else {
      chip.setOnTouchListener(null)
      chip.isClickable = false
    }
  }

  private fun walkTranslateLanguagePickerOptions(
    root: View,
    fg: Int,
    keyBg: Int,
    selectedBg: Int,
    selectedLabel: Int,
  ) {
    when (val tag = root.tag as? String) {
      null -> Unit
      else ->
        when {
          tag.startsWith("picker-option:translate-source:") -> {
            applyTranslateLanguageOptionState(
              root as TextView,
              tag.removePrefix("picker-option:translate-source:"),
              isSourceColumn = true,
              fg,
              keyBg,
              selectedBg,
              selectedLabel,
            )
            return
          }
          tag.startsWith("picker-option:translate-target:") -> {
            applyTranslateLanguageOptionState(
              root as TextView,
              tag.removePrefix("picker-option:translate-target:"),
              isSourceColumn = false,
              fg,
              keyBg,
              selectedBg,
              selectedLabel,
            )
            return
          }
        }
    }
    if (root is ViewGroup) {
      for (index in 0 until root.childCount) {
        walkTranslateLanguagePickerOptions(
          root.getChildAt(index),
          fg,
          keyBg,
          selectedBg,
          selectedLabel,
        )
      }
    }
  }

  private fun applyTranslateLanguageOptionState(
    optionView: TextView,
    languageCode: String,
    isSourceColumn: Boolean,
    fg: Int,
    keyBg: Int,
    selectedBg: Int,
    selectedLabel: Int,
  ) {
    val selected =
      if (isSourceColumn) {
        languageCode.equals(sourceLanguageCode, ignoreCase = true)
      } else {
        languageCode.equals(targetLanguageCode, ignoreCase = true)
      }
    optionView.setTextColor(if (selected) selectedLabel else fg)
    optionView.background = roundedBg(if (selected) selectedBg else keyBg, 12f)
    optionView.isClickable = true
    optionView.bindTranslateLanguageOption(languageCode, isSourceColumn)
  }

  private fun TextView.bindTranslateLanguageOption(languageCode: String, isSourceColumn: Boolean) {
    setOnTouchListener(
      TapTouch(allowParentScroll = true) {
        val language =
          (if (isSourceColumn) supportedSourceLanguages() else supportedTargetLanguages())
            .firstOrNull { it.code.equals(languageCode, ignoreCase = true) }
            ?: return@TapTouch
        
        val previousTargetCode = targetLanguageCode

        if (isSourceColumn) {
          if (language.code.equals(targetLanguageCode, ignoreCase = true)) {
             targetLanguageCode = sourceLanguageCode
             targetLanguageName = sourceLanguageName
          }
          sourceLanguageCode = language.code
          sourceLanguageName = language.name
        } else {
          if (language.code.equals(sourceLanguageCode, ignoreCase = true)) {
             sourceLanguageCode = targetLanguageCode
             sourceLanguageName = targetLanguageName
          }
          targetLanguageCode = language.code
          targetLanguageName = language.name
        }
        persistCurrentTranslateLanguages()
        val skipAutoRetranslate = lastTranslationState?.isSelectionScoped == true
        val retranslateSource =
          if (lastTranslationState != null && !skipAutoRetranslate) lastSentTranslationSourceText
          else null
        discardTranslationUndo(refreshUi = false)
        refreshOpenPickerSelections()

        val languageChanged = !isSourceColumn && !language.code.equals(previousTargetCode, ignoreCase = true)

        if (languageChanged && autoTranslateOnLanguageChange && !skipAutoRetranslate) {
          val input = inputSupplier()
          if (input != null) {
            val hasText =
              translationSourceText(input).isNotBlank() || !retranslateSource.isNullOrBlank()
            if (hasText) {
              featureMode = FeatureMode.TRANSLATE
              rebuild()
              triggerTranslate(preferredSource = retranslateSource)
            }
          }
        }
      },
    )
  }

  private fun isFullscreenFeatureMode(): Boolean =
    !pickerSearchActive && (featureMode == FeatureMode.LANGUAGE_PICKER ||
      featureMode == FeatureMode.THINKING_VIEW ||
      featureMode == FeatureMode.DICTIONARY_LANGUAGE_PICKER ||
      featureMode == FeatureMode.DICTIONARY_RESULT ||
      featureMode == FeatureMode.KEYBOARD_LANGUAGE_PICKER ||
      featureMode == FeatureMode.TTS_LANGUAGE_PICKER ||
      featureMode == FeatureMode.STT_LANGUAGE_PICKER ||
      featureMode == FeatureMode.STT ||
      featureMode == FeatureMode.EMOJI ||
      featureMode == FeatureMode.INFERENCE_DEBUG)

  private fun ensureKeyboardContainers() {
    if (topAreaContainer != null && contentContainer != null && childCount == 2) {
      topAreaContainer?.layoutParams?.height = dp(TOOLBAR_HEIGHT_DP)
      return
    }
    removeAllViews()
    topAreaContainer =
      FrameLayout(context).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(TOOLBAR_HEIGHT_DP))
      }
    contentContainer =
      FrameLayout(context).apply {
        layoutParams = flex()
      }
    addView(topAreaContainer)
    addView(contentContainer)
    renderedTopAreaSignature = null
    renderedContentSignature = null
    renderedBoardKind = null
  }

  private fun renderTopArea() {
    resetTopAreaRefs()
    val container = topAreaContainer ?: return
    container.removeAllViews()
    container.addView(buildTopArea(), LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private fun renderBoardContent() {
    resetBoardRefs()
    val container = contentContainer ?: return
    container.removeAllViews()
    val kind =
      when {
        isToolsPanelOpen -> BoardKind.TOOLS
        featureMode == FeatureMode.CLIPBOARD -> BoardKind.CLIPBOARD
        featureMode == FeatureMode.TEXT_EDITING -> BoardKind.TEXT_EDITING
        else -> BoardKind.KEYS
      }
    val board =
      when {
        kind == BoardKind.TOOLS -> buildToolsPanel()
        kind == BoardKind.CLIPBOARD -> buildClipboardBoard()
        kind == BoardKind.TEXT_EDITING -> buildTextEditingBoard()
        else -> buildKeyBoard()
      }
    container.addView(board, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    if (kind != renderedBoardKind) {
      board.alpha = 0f
      board.animate().alpha(1f).setDuration(BOARD_SWAP_FADE_MS).start()
    }
    renderedBoardKind = kind
  }

  private fun renderFullscreenContent() {
    resetTopAreaRefs()
    resetBoardRefs()
    renderedTopAreaSignature = null
    renderedContentSignature = null
    renderedBoardKind = null
    topAreaContainer = null
    contentContainer = null
    removeAllViews()
    when (featureMode) {
      FeatureMode.LANGUAGE_PICKER ->
        addView(
          buildLanguagePicker(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.THINKING_VIEW ->
        addView(
          buildThinkingView(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.DICTIONARY_LANGUAGE_PICKER ->
        addView(
          buildDictionaryLanguagePicker(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.KEYBOARD_LANGUAGE_PICKER ->
        addView(
          buildKeyboardLanguagePicker(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.TTS_LANGUAGE_PICKER ->
        addView(
          buildTtsLanguageVoicePicker(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.STT_LANGUAGE_PICKER ->
        addView(
          buildSttLanguagePicker(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.DICTIONARY_RESULT ->
        addView(
          buildDictionaryResultView(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.EMOJI ->
        addView(
          buildEmojiView(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.INFERENCE_DEBUG ->
        addView(
          buildInferenceDebugView(),
          LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx),
        )
      FeatureMode.STT ->
        try {
          val sttView = buildSttView()
          addView(sttView, LayoutParams(LayoutParams.MATCH_PARENT, totalKeyboardHeightPx()))
          if (sttShouldAutoStart) {
            sttShouldAutoStart = false
            mainHandler.removeCallbacks(startSttListeningRunnable)
            mainHandler.postDelayed(startSttListeningRunnable, 150L)
          }
        } catch (e: Exception) {
          Log.e(TAG, "STT view error: ${e.message}", e)
          featureMode = FeatureMode.KEYBOARD
          rebuild()
        }
      else -> Unit
    }
  }

  private fun resetTopAreaRefs() {
    predictionBarView = null
    sttMicButton = null
    ttsButton = null
    ttsContainer = null
    ttsSpinner = null
    ttsWaveformView = null
    sttRecordTimerView = null
    sttWaveformView = null
  }

  private fun resetBoardRefs() {
    letterKeyViews.clear()
    boardKeyViews.clear()
    boardLetters.clear()
    tapRedirects.clear()
    boardRootView = null
    shiftKeyView = null
    discardKeyPreview()
    sttLiveText = null
    sttLiveMicBtn = null
    sttSentLogView = null
    sttRecvLogView = null
  }

  private fun applyActionResult(
    result: KeyboardActionResult,
    countAsTyping: Boolean = false,
    countsCompletedWord: Boolean = false,
  ) {
    var shouldRebuild = result.rebuild
    result.commitText?.let {
      if (pickerSearchActive) {
        updatePickerSearchQuery(it)
        return@let
      }
      if (discardTranslationUndo(refreshUi = false)) {
        shouldRebuild = true
      }
      commitTrackedText(it, countAsTyping, countsCompletedWord)
      refreshAutoCaps()
    }
    if (result.refreshLetterLabels) {
      updateLetterKeyLabels()
    }
    if (shouldRebuild) {
      rebuild()
    }
  }

  private fun flex(): LayoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)

  private fun buildTopArea(): LinearLayout {
    val surface = color("surface", "#121214")
    return LinearLayout(context).apply {
      orientation = VERTICAL
      setPadding(dp(2), dp(2), dp(2), dp(3))
      setBackgroundColor(surface)
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(TOOLBAR_HEIGHT_DP))
      val bar = when {
        pickerSearchActive -> buildPickerSearchView()
        isAudioMenuOpen -> buildAudioMenuBar()
        featureMode == FeatureMode.TRANSLATE -> buildTranslateHeader()
        featureMode == FeatureMode.TTS -> buildTtsHeader()
        featureMode == FeatureMode.DICTIONARY -> buildDictionaryHeader()
        featureMode == FeatureMode.CLIPBOARD -> buildClipboardHeader()
        featureMode == FeatureMode.TEXT_EDITING -> buildTextEditingHeader()
        toolbarError(ToolbarErrorSlot.MODE_BAR) != null -> buildModeBar()
        predictiveBarEnabled && blockFix != null -> blockFix!!.let { (original, corrected) -> buildBlockFixBar(original, corrected) }
        predictiveBarEnabled && !showModeBarUntilNextTyping && hasSuggestions() ->
          buildPredictionBar()
        else -> buildModeBar()
      }
      bar.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      addView(bar)
    }
  }

  private fun blinkingCaret(tint: Int): View =
    View(context).apply {
      setBackgroundColor(tint)
      layoutParams = LayoutParams(dp(2), dp(18)).apply { marginStart = dp(1) }
      startAnimation(
        android.view.animation.AlphaAnimation(1f, 0f).apply {
          duration = 500
          repeatMode = android.view.animation.Animation.REVERSE
          repeatCount = android.view.animation.Animation.INFINITE
        },
      )
    }

  private fun buildPickerSearchView(): LinearLayout {
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val labelColor = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#A1A1AA")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_back,
          contentDescriptionText = "Back to picker",
          bg = Color.TRANSPARENT,
          tint = labelColor,
        ) {
          closePickerSearch()
        },
      )

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          val fieldWidth = dp(140)
          val caretReserve = dp(2) + dp(1)
          background = roundedBg(keyBg, 17f)
          layoutParams = LayoutParams(fieldWidth, dp(34)).apply { marginStart = dp(8) }
          setPadding(dp(12), 0, dp(12), 0)

          addView(
            ImageView(context).apply {
              setImageResource(R.drawable.ic_mode_search)
              setColorFilter(muted)
              layoutParams = LayoutParams(dp(14), dp(14))
            }
          )

          val isPlaceholder = pickerSearchQuery.isEmpty()
          val placeholderText =
            when (pickerSearchScope) {
              PickerSearchScope.TRANSLATE_SOURCE -> "Search source language"
              PickerSearchScope.TRANSLATE_TARGET -> "Search target language"
              PickerSearchScope.TTS_VOICE -> "Search voice"
              PickerSearchScope.EMOJI -> "Search emoji"
              else -> "Search language"
            }

          if (isPlaceholder) {
            addView(blinkingCaret(accent))
          }
          addView(
            TextView(context).apply {
              text = if (isPlaceholder) placeholderText else pickerSearchQuery
              setTextColor(if (isPlaceholder) muted else labelColor)
              textSize = (fontSize - 1f).coerceAtLeast(12f)
              typeface = keyTypeface
              setPadding(dp(6), 0, dp(2), 0)
              maxLines = 1
              ellipsize =
                if (isPlaceholder) android.text.TextUtils.TruncateAt.END
                else android.text.TextUtils.TruncateAt.START
              contentDescription = placeholderText
              maxWidth = fieldWidth - dp(12) - dp(12) - dp(14) - caretReserve
              layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
            },
          )
          if (!isPlaceholder) {
            addView(blinkingCaret(accent))
          }
          addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
        }
      )

      val query = pickerSearchQuery
      val emojiSearch = pickerSearchScope == PickerSearchScope.EMOJI
      val options = if (emojiSearch) {
        if (query.isEmpty()) recentEmojiStore.recent().take(40).map { it to it }
        else emojiRepository.search(query, recentEmojiStore, 40).map { it.name to it.sequence }
      } else pickerSearchOptions().filter {
        query.isEmpty() || it.first.contains(query, ignoreCase = true)
      }.take(if (query.isEmpty()) 5 else Int.MAX_VALUE)

      addView(
        HorizontalScrollView(context).apply {
          isHorizontalScrollBarEnabled = false
          layoutParams = LayoutParams(0, LayoutParams.MATCH_PARENT, 1f).apply { marginStart = dp(8) }
          
          addView(
            LinearLayout(context).apply {
              orientation = HORIZONTAL
              gravity = Gravity.CENTER_VERTICAL
              
              if (options.isEmpty()) {
                addView(
                  TextView(context).apply {
                    text = if (emojiSearch && query.isEmpty()) "No recently used emoji" else "Not found"
                    setTextColor(muted)
                    textSize = (fontSize - 2f).coerceAtLeast(11f)
                    typeface = keyTypeface
                    setPadding(dp(8), 0, dp(8), 0)
                  }
                )
              } else {
                options.forEach { (name, value) ->
                  addView(
                    TextView(context).apply {
                      text = if (emojiSearch) value else name
                      setTextColor(labelColor)
                      textSize = if (emojiSearch) 22f else (fontSize - 2f).coerceAtLeast(11f)
                      typeface = if (emojiSearch) Typeface.DEFAULT else keyTypeface
                      gravity = Gravity.CENTER
                      background = if (emojiSearch) null else roundedBg(toolbar, 14f)
                      setPadding(dp(12), 0, dp(12), 0)
                      contentDescription = "Select $name"
                      layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, dp(28)).apply { marginEnd = dp(6) }
                      setOnTouchListener(TapTouch { selectPickerSearchOption(value) })
                    }
                  )
                }
              }
            }
          )
        }
      )
    }
  }

  private fun buildPickerSectionHeader(title: String, scope: PickerSearchScope, bg: Int): LinearLayout {
    val toolbar = color("toolbar", "#18181B")
    val label = color("label", "#EAEAEE")
    val keyBg = color("key", "#2C2C31")
    
    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      
      addView(
        TextView(context).apply {
          text = title
          setTextColor(keyBg)
          textSize = (fontSize - 2f).coerceAtLeast(10f)
          typeface = keyTypeface
          setPadding(dp(4), 0, dp(4), dp(6))
        },
        LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
      )

      addView(
        FrameLayout(context).apply {
          background = roundedBg(toolbar, 999f)
          layoutParams = LayoutParams(dp(28), dp(28)).apply { bottomMargin = dp(6) }
          
          addView(
            ImageView(context).apply {
              setImageResource(R.drawable.ic_mode_search)
              setColorFilter(label)
              layoutParams = FrameLayout.LayoutParams(dp(12), dp(12), Gravity.CENTER)
            }
          )
          
          setOnTouchListener(TapTouch { beginPickerSearch(scope, featureMode) })
        }
      )
    }
  }

  private fun buildTranslateHeader(): LinearLayout {
    val keyBg = color("key", "#515151")
    val label = color("label", "#FFFFFF")
    val accent = color("accent", "#515151")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_close,
          contentDescriptionText = "Close translate mode",
          bg = Color.TRANSPARENT,
          tint = label,
        ) {
          featureMode = FeatureMode.KEYBOARD
          clearToolbarError(ToolbarErrorSlot.TRANSLATE)
          rebuild()
        },
      )

      val centerViews = mutableListOf<View>(
        View(context).apply { layoutParams = LayoutParams(0, 0, 1f) },
        translateLanguageChip(sourceLanguageName, keyBg, label) {
          selectingSourceLanguage = true
          featureMode = FeatureMode.LANGUAGE_PICKER
          rebuild()
        },
        translateIconChip(keyBg, label, enabled = canSwapTranslateLanguages()) {
          swapTranslateLanguages()
        },
        translateLanguageChip(targetLanguageName, keyBg, label) {
          selectingSourceLanguage = false
          featureMode = FeatureMode.LANGUAGE_PICKER
          rebuild()
        },
        View(context).apply { layoutParams = LayoutParams(0, 0, 1f) },
      )
      toolbarError(ToolbarErrorSlot.TRANSLATE)?.let { error ->
        centerViews.clear()
        centerViews.add(inlineToolbarErrorLabel(error) { dismissToolbarError(ToolbarErrorSlot.TRANSLATE) })
      }
      centerViews.forEach { addView(it) }

      if (canShowTranslationThinking()) {
        addView(thinkingIconChip(keyBg, label, accent))
      }
      addView(translateActionIcon(keyBg, label, accent))
    }
  }

  private fun buildTtsHeader(): LinearLayout {
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#FFFFFF")
    val accent = color("accent", "#3B82F6")
    val hasClip = isTtsPlaying || isTtsPaused || hasShareableTts()

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_close,
          contentDescriptionText = "Close text to speech",
          bg = Color.TRANSPARENT,
          tint = label,
        ) {
          stopTts()
          clearTtsClip()
          clearToolbarError(ToolbarErrorSlot.TTS)
          featureMode = FeatureMode.KEYBOARD
          rebuild()
        },
      )

      addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })

      val error = toolbarError(ToolbarErrorSlot.TTS)
      when {
        error != null -> addView(inlineToolbarErrorLabel(error) { dismissToolbarError(ToolbarErrorSlot.TTS) })
        isTtsLoading -> addView(ttsGeneratingChip(label))
        hasClip -> addView(ttsPlaybackPill(keyBg, label, accent))
        else -> addView(ttsSelectionChips(keyBg, label))
      }

      addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })

      when {
        isTtsLoading ->
          addView(
            ttsHeaderActionChip(keyBg, label, R.drawable.ic_audio_close, "Stop") {
              stopTts()
              rebuild()
            },
          )
        hasClip -> addView(View(context).apply { layoutParams = LayoutParams(dp(34), dp(34)) })
        else ->
          addView(
            ttsHeaderActionChip(keyBg, label, R.drawable.ic_audio_play, "Play") { startTts() },
          )
      }
    }
  }

  private fun ttsGeneratingChip(tint: Int): LinearLayout =
    LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(
        ProgressBar(context).apply {
          isIndeterminate = true
          indeterminateTintList = android.content.res.ColorStateList.valueOf(tint)
          layoutParams = LayoutParams(dp(18), dp(18)).apply { marginEnd = dp(8) }
        },
      )
      addView(
        TextView(context).apply {
          text = "Generating…"
          setTextColor(tint)
          textSize = (fontSize - 1f).coerceAtLeast(12f)
          typeface = keyTypeface
        },
      )
    }

  private fun ttsSelectionChips(bg: Int, fg: Int): LinearLayout =
    LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(
        ttsSelectionChip(ttsLanguageName(), bg, fg) {
          featureMode = FeatureMode.TTS_LANGUAGE_PICKER
          rebuild()
        },
      )
      addView(
        ttsSelectionChip(resolvedTtsVoice(), bg, fg) {
          featureMode = FeatureMode.TTS_LANGUAGE_PICKER
          rebuild()
        },
      )
    }

  private fun ttsSelectionChip(labelText: String, bg: Int, fg: Int, onClick: () -> Unit): TextView =
    TextView(context).apply {
      text = labelText
      setTextColor(fg)
      textSize = (fontSize - 2f).coerceAtLeast(10f)
      typeface = keyTypeface
      gravity = Gravity.CENTER
      minHeight = dp(30)
      minWidth = dp(72)
      background = roundedBg(bg, 999f)
      setPadding(dp(12), dp(6), dp(12), dp(6))
      layoutParams =
        LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
          marginEnd = dp(6)
        }
      setOnTouchListener(TapTouch { onClick() })
    }

  private fun ttsHeaderActionChip(
    bg: Int,
    fg: Int,
    iconRes: Int,
    description: String,
    onClick: () -> Unit,
  ): FrameLayout =
    FrameLayout(context).apply {
      background = roundedBg(bg, 999f)
      layoutParams = LayoutParams(dp(32), dp(32)).apply { marginStart = dp(4) }
      contentDescription = description
      addView(
        ImageView(context).apply {
          setImageResource(iconRes)
          setColorFilter(fg)
          scaleType = ImageView.ScaleType.FIT_CENTER
          layoutParams = FrameLayout.LayoutParams(dp(15), dp(15), Gravity.CENTER)
        },
      )
      setOnTouchListener(TapTouch { onClick() })
    }

  private fun ttsPlaybackPill(bg: Int, fg: Int, accent: Int): LinearLayout {
    val pill =
      LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        background = roundedBg(bg, 999f)
        setPadding(dp(6), dp(3), dp(6), dp(3))
        layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, dp(34))
      }

    pill.addView(
      pillIconButton(
        iconRes = if (isTtsPlaying) R.drawable.ic_audio_pause else R.drawable.ic_audio_play,
        fg = fg,
        inset = dp(5),
        marginEndDp = 8,
      ) {
        if (isTtsPlaying) pauseTts() else resumeTts()
      },
    )

    val waveform =
      AudioWaveformView(context).apply {
        barColor = accent
        layoutParams = LayoutParams(dp(94), dp(22)).apply { marginEnd = dp(8) }
      }
    waveform.setDecorative(isTtsPlaying)
    ttsWaveformView = waveform
    pill.addView(waveform)

    pill.addView(
      pillIconButton(R.drawable.ic_audio_share, fg, dp(5), marginEndDp = 4) { shareTtsAudio() },
    )
    pill.addView(
      pillIconButton(R.drawable.ic_audio_close, fg, dp(6), marginEndDp = 0) {
        stopTts()
        clearTtsClip()
        rebuild()
      },
    )

    return pill
  }

  private fun pillIconButton(
    iconRes: Int,
    fg: Int,
    inset: Int,
    marginEndDp: Int,
    onClick: () -> Unit,
  ): FrameLayout =
    FrameLayout(context).apply {
      layoutParams = LayoutParams(dp(26), dp(26)).apply { marginEnd = dp(marginEndDp) }
      isClickable = true
      isFocusable = true
      addView(
        ImageView(context).apply {
          setImageResource(iconRes)
          setColorFilter(fg)
          scaleType = ImageView.ScaleType.CENTER_INSIDE
          setPadding(inset, inset, inset, inset)
          layoutParams =
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
        },
      )
      setOnTouchListener(TapTouch { onClick() })
    }

  private fun buildDictionaryHeader(): FrameLayout {
    val keyBg = color("key", "#515151")
    val label = color("label", "#FFFFFF")
    val accent = color("accent", "#515151")

    return FrameLayout(context).apply {
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_close,
          contentDescriptionText = "Close dictionary mode",
          bg = Color.TRANSPARENT,
          tint = label,
        ) {
          dictionaryLookupRequestId += 1
          featureMode = FeatureMode.KEYBOARD
          clearToolbarError(ToolbarErrorSlot.DICTIONARY)
          isDictionaryLoading = false
          lastSentDictionarySourceText = null
          rebuild()
        },
        FrameLayout.LayoutParams(dp(32), dp(32), Gravity.START or Gravity.CENTER_VERTICAL),
      )

      val centerView =
        toolbarError(ToolbarErrorSlot.DICTIONARY)?.let { error ->
          inlineToolbarErrorLabel(error) { dismissToolbarError(ToolbarErrorSlot.DICTIONARY) }
        } ?: translateLanguageChip(dictionaryLanguageName, keyBg, label) {
          if (!isDictionaryLoading) {
            featureMode = FeatureMode.DICTIONARY_LANGUAGE_PICKER
            rebuild()
          }
        }.also {
          it.isEnabled = !isDictionaryLoading
          it.alpha = if (isDictionaryLoading) 0.5f else 1f
        }
      addView(
        FrameLayout(context).apply {
          addView(
            centerView,
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.WRAP_CONTENT,
              FrameLayout.LayoutParams.WRAP_CONTENT,
              Gravity.CENTER,
            ),
          )
        },
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.WRAP_CONTENT,
          Gravity.CENTER,
        ).apply {
          marginStart = dp(36)
          marginEnd = dp(36)
        },
      )

      addView(
        dictionaryActionIcon(keyBg, label, accent),
        FrameLayout.LayoutParams(dp(32), dp(32), Gravity.END or Gravity.CENTER_VERTICAL),
      )
    }
  }

  private fun buildClipboardHeader(): LinearLayout {
    val labelColor = color("label", "#EAEAEE")
    val keyBg = color("key", "#2C2C31")
    val accent = color("accent", "#3B82F6")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_back,
          contentDescriptionText = "Close clipboard",
          bg = Color.TRANSPARENT,
          tint = labelColor,
        ) {
          clearToolbarError(ToolbarErrorSlot.CLIPBOARD)
          isClipboardEditMode = false
          featureMode = FeatureMode.KEYBOARD
          rebuild()
        },
      )

      val error = toolbarError(ToolbarErrorSlot.CLIPBOARD)
      addView(
        error?.let {
          inlineToolbarErrorLabel(it) { dismissToolbarError(ToolbarErrorSlot.CLIPBOARD) }
        }
          ?: TextView(context).apply {
            text = "Clipboard"
            setTextColor(labelColor)
            textSize = (fontSize - 1f).coerceAtLeast(11f)
            typeface = keyTypeface
            maxLines = 1
            layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
          },
      )

      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_keyboard_edit,
          contentDescriptionText = if (isClipboardEditMode) "Done editing clips" else "Edit clips",
          bg = if (isClipboardEditMode) accent else keyBg,
          tint = labelColor,
        ) {
          isClipboardEditMode = !isClipboardEditMode
          rebuild()
        },
      )
    }
  }

  private fun buildTextEditingHeader(): LinearLayout {
    val labelColor = color("label", "#EAEAEE")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_back,
          contentDescriptionText = "Close text editing",
          bg = Color.TRANSPARENT,
          tint = labelColor,
        ) {
          isTextEditingSelectMode = false
          textEditingAnchor = -1
          featureMode = FeatureMode.KEYBOARD
          rebuild()
        },
      )

      addView(
        TextView(context).apply {
          text = "Text editing"
          setTextColor(labelColor)
          textSize = (fontSize - 1f).coerceAtLeast(11f)
          typeface = keyTypeface
          maxLines = 1
          layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
        },
      )
    }
  }

  private fun buildModeBar(): LinearLayout {
    val accent = color("accent", "#3B82F6")
    val keyBg = color("key", "#2C2C31")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      val icons =
        (toolOrder
          .take(TOOLBAR_TOOL_COUNT)
          .map { toolbarIconFor(it, keyBg, accent) } + toolsPanelToggleIcon(keyBg, accent)).toMutableList()

      toolbarError(ToolbarErrorSlot.MODE_BAR)?.let { error ->
        icons.add(1, inlineToolbarErrorLabel(error) { dismissToolbarError(ToolbarErrorSlot.MODE_BAR) })
      }
      icons.forEachIndexed { index, icon ->
        if (index > 0) {
          addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
        }
        addView(icon)
      }
    }
  }

  private fun toolbarIconFor(tool: KeyboardTool, bg: Int, accent: Int): View =
    when (tool) {
      KeyboardTool.TRANSLATE -> modeToggleIcon(bg, accent)
      KeyboardTool.VOICE -> sttMicIcon()
      KeyboardTool.SPEAK -> ttsIcon()
      KeyboardTool.DICTIONARY -> dictionaryModeIcon(bg, accent)
      KeyboardTool.CLIPBOARD -> clipboardIcon(bg, accent)
      KeyboardTool.TEXT_EDITING -> textEditingIcon(bg, accent)
      KeyboardTool.LANGUAGES -> languagesIcon(bg, accent)
      KeyboardTool.EMOJI -> emojiIcon(bg, accent)
      KeyboardTool.SETTINGS -> settingsIcon(bg)
    }

  private fun buildPredictionBar(): LinearLayout {
    val label = color("label", "#EAEAEE")
    return LinearLayout(context).apply {
      predictionBarView = this
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))
      dividerDrawable =
        GradientDrawable().apply {
          setColor(Color.argb(60, Color.red(label), Color.green(label), Color.blue(label)))
          setSize(dp(1), 0)
        }
      showDividers = SHOW_DIVIDER_MIDDLE
      dividerPadding = dp(10)
      repeat(SUGGESTION_SLOTS) { index ->
        addView(
          TextView(context).apply {
            setTextColor(label)
            textSize = (fontSize - 2f).coerceAtLeast(11f)
            typeface = keyTypeface
            gravity = Gravity.CENTER
            maxLines = 1
            compoundDrawablePadding = dp(4)
            setPadding(dp(8), dp(5), dp(8), dp(5))
            layoutParams = LayoutParams(0, dp(34), 1f)
            setOnTouchListener(TapTouch { shownSuggestions.getOrNull(index)?.let(::insertPrediction) })
          },
        )
      }
      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER
          layoutParams = LayoutParams(0, dp(34), 1f)
          repeat(MAX_EMOJI_SUGGESTIONS) { index ->
            addView(
              TextView(context).apply {
                textSize = fontSize + 2f
                typeface = Typeface.DEFAULT
                gravity = Gravity.CENTER
                setPadding(dp(6), 0, dp(6), 0)
                layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT)
                setOnTouchListener(TapTouch { currentEmojis.getOrNull(index)?.let(::replaceWordWithEmoji) })
              },
            )
          }
        },
      )
      addView(
        toolbarIcon(
          iconRes = R.drawable.ic_audio_close,
          contentDescriptionText = "Cancel suggestions",
          bg = Color.TRANSPARENT,
          tint = label,
        ) {
          showModeBarUntilNextTyping = true
          rebuild()
        },
      )
      bindPredictionBarSlots(this)
    }
  }

  private fun bindPredictionBarSlots(bar: LinearLayout) {
    val emojiGroup = bar.getChildAt(SUGGESTION_SLOTS) as LinearLayout
    var emojiWidth = 0f
    for (index in 0 until MAX_EMOJI_SUGGESTIONS) {
      val slot = emojiGroup.getChildAt(index) as TextView
      val emoji = currentEmojis.getOrNull(index)
      slot.text = emoji.orEmpty()
      slot.visibility = if (emoji == null) View.GONE else View.VISIBLE
      if (emoji != null) emojiWidth += slot.paint.measureText(emoji) + slot.paddingLeft + slot.paddingRight
    }
    emojiGroup.visibility = if (currentEmojis.isEmpty()) View.GONE else View.VISIBLE

    val barWidth = bar.width.takeIf { it > 0 } ?: (resources.displayMetrics.widthPixels - 2 * containerPaddingPx)
    val available = barWidth - bar.paddingLeft - bar.paddingRight - dp(36) - dp(SUGGESTION_SLOTS)
    val paint = (bar.getChildAt(0) as TextView).paint
    val shown = currentSuggestions.take(SUGGESTION_SLOTS).toMutableList()
    fun fits(): Boolean {
      val share = available.toFloat() / (shown.size + if (currentEmojis.isEmpty()) 0 else 1)
      return emojiWidth <= share &&
        shown.all { word ->
          paint.measureText(word) + dp(16) + (if (word in modelSuggestions) dp(8) else 0) <= share
        }
    }
    while (shown.isNotEmpty() && !fits()) shown.removeAt(shown.lastIndex)
    shownSuggestions = shown

    for (index in 0 until SUGGESTION_SLOTS) {
      val slot = bar.getChildAt(index) as TextView
      val word = shown.getOrNull(index)
      slot.text = word.orEmpty()
      slot.visibility = if (word == null) View.GONE else View.VISIBLE
      slot.setCompoundDrawablesRelative(if (word != null && word in modelSuggestions) modelDot() else null, null, null, null)
    }
  }

  private fun modelDot(): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(Color.argb(80, 52, 199, 89))
      setBounds(0, 0, dp(4), dp(4))
    }

  private fun replaceWordWithEmoji(sequence: String) {
    val input = inputSupplier() ?: return
    val word = contextEngine.snapshot().currentWord
    if (word.isNotEmpty()) {
      input.deleteSurroundingText(word.length, 0)
      contextEngine.applyDeletedBeforeCursor(word.length)
    }
    insertEmoji(sequence)
    commitTrackedText(" ", countAsTyping = true)
  }

  private fun hasSuggestions(): Boolean = currentSuggestions.isNotEmpty() || currentEmojis.isNotEmpty()

  private fun emojiSuggestions(word: String): List<String> {
    if (word.length < MIN_EMOJI_WORD_CHARS) return emptyList()
    if (!emojiRepository.isReady) {
      emojiRepository.warmup(onLoaded = { mainHandler.post { predictionOrchestrator.refresh() } })
      return emptyList()
    }
    return emojiRepository.suggest(word, recentEmojiStore, MAX_EMOJI_SUGGESTIONS)
  }

  private fun onSuggestionsChanged(state: SuggestionUiState) {
    modelSuggestions = if (state.visible) state.modelWords else emptySet()
    applySuggestionState(
      if (state.visible) state.candidates else emptyList(),
      if (state.visible) state.emojis else emptyList(),
    )
  }

  private fun applySuggestionState(suggestions: List<String>, emojis: List<String>) {
    currentSuggestions = suggestions
    if (showHitSlopOverlay) boardRootView?.invalidate()
    currentEmojis = emojis
    val predictionCouldShow =
      !pickerSearchActive && !isAudioMenuOpen &&
        featureMode == FeatureMode.KEYBOARD &&
        toolbarError(ToolbarErrorSlot.MODE_BAR) == null
    val shouldShow =
      predictionCouldShow && predictiveBarEnabled &&
        !showModeBarUntilNextTyping && hasSuggestions()
    if (shouldShow != (predictionBarView != null)) {
      renderTopArea()
      renderedTopAreaSignature = currentTopAreaSignature()
      return
    }
    predictionBarView?.let(::bindPredictionBarSlots)
  }

  private fun insertPrediction(suggestion: String) {
    val input = inputSupplier() ?: return
    val prefix = contextEngine.snapshot().currentWord
    if (prefix.isNotEmpty()) {
      input.deleteSurroundingText(prefix.length, 0)
      contextEngine.applyDeletedBeforeCursor(prefix.length)
    }
    commitTrackedText("$suggestion ", countAsTyping = true, countsCompletedWord = true)
    refreshAutoCaps()
  }

  private fun loginPromptChip(bg: Int, fg: Int): TextView =
    TextView(context).apply {
      text = "Log in to Hypa Intelligence"
      setTextColor(fg)
      textSize = 13f
      typeface = keyTypeface
      gravity = Gravity.CENTER
      background = roundedBg(bg, 999f)
      minHeight = dp(34)
      setPadding(dp(14), dp(6), dp(14), dp(6))
      layoutParams =
        LayoutParams(LayoutParams.WRAP_CONTENT, dp(34)).apply {
          marginEnd = dp(6)
        }
      isClickable = true
      isFocusable = true
      setOnTouchListener(TapTouch { openHostApp() })
    }

  private fun openHostApp() {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    startHostApp(intent)
  }

  private fun openHostAppSettings() {
    val intent =
      android.content.Intent(
          android.content.Intent.ACTION_VIEW,
          android.net.Uri.parse("hypaintelligence://settings"),
        )
        .apply {
          setPackage(context.packageName)
          addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
    startHostApp(intent)
  }

  private fun startHostApp(intent: android.content.Intent?) {
    if (intent == null) return
    runCatching { context.startActivity(intent) }
      .onFailure { Log.w(TAG, "Host app launch failed", it) }
  }

  private fun buildAudioMenuBar(): LinearLayout {
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val keyBg = color("key", "#2C2C31")
    val surface = color("surface", "#121214")
    val recordRed = Color.parseColor("#EF4444")
    val muted = Color.parseColor("#A1A1AA")

    return LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), dp(2), dp(4), dp(2))

      addView(audioMenuBackChip(keyBg, label))
      addView(audioMenuLiveChip(keyBg, label, accent))

      val recording = isSttRecording || hasSttRecordedAudio()
      val error = toolbarError(ToolbarErrorSlot.STT)
      when {
        error != null ->
          addView(inlineToolbarErrorLabel(error) { dismissToolbarError(ToolbarErrorSlot.STT) })
        recording ->
          addView(audioMenuWidePill(keyBg, surface, label, accent, muted, recordRed))
        else -> {
          addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
          addView(sttLanguagePill(keyBg, label))
          addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
        }
      }
      if (recording) {
        addView(audioMenuGenerateChip(label, accent, muted))
      } else {
        addView(audioMenuMicActionChip(keyBg, label, muted))
      }
    }
  }

  private fun sttLanguagePill(bg: Int, fg: Int): TextView =
    TextView(context).apply {
      text = sttLanguageName
      setTextColor(fg)
      textSize = (fontSize - 2f).coerceAtLeast(10f)
      typeface = keyTypeface
      gravity = Gravity.CENTER
      minHeight = dp(30)
      minWidth = dp(90)
      background = roundedBg(bg, 999f)
      setPadding(dp(12), dp(6), dp(12), dp(6))
      setOnTouchListener(TapTouch {
        featureMode = FeatureMode.STT_LANGUAGE_PICKER
        rebuild()
      })
    }

  private fun audioMenuMicActionChip(bg: Int, fg: Int, muted: Int): FrameLayout {
    val disabled = isSttTranscribing
    return FrameLayout(context).apply {
      background = roundedBg(bg, 999f)
      layoutParams = LayoutParams(dp(34), dp(34)).apply { marginStart = dp(4) }
      alpha = if (disabled) 0.45f else 1f
      contentDescription = "Record"
      addView(ImageView(context).apply {
        setImageResource(R.drawable.ic_audio_mic)
        setColorFilter(if (disabled) muted else fg)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        val inset = dp(8)
        setPadding(inset, inset, inset, inset)
        layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        )
        isClickable = false
        isFocusable = false
      })
      if (!disabled) setOnTouchListener(TapTouch { startSttRecording() })
    }
  }

  private fun audioMenuWidePill(
    bg: Int,
    micCircleBg: Int,
    fg: Int,
    accent: Int,
    muted: Int,
    recordRed: Int,
  ): LinearLayout {
    val pill = LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = roundedBg(bg, 999f)
      setPadding(dp(4), 0, dp(14), 0)
      layoutParams = LayoutParams(0, dp(34), 1f).apply { marginEnd = dp(8) }
    }

    val leftIconRes = when {
      isSttRecording -> R.drawable.ic_audio_stop
      isAudioMenuPlaying -> R.drawable.ic_audio_pause
      hasSttRecordedAudio() -> R.drawable.ic_audio_play
      else -> R.drawable.ic_audio_mic
    }
    val leftAction: () -> Unit = when {
      isSttRecording -> ({ stopSttRecordingOnly() })
      hasSttRecordedAudio() -> ({ toggleAudioMenuPlayback() })
      else -> ({})
    }
    pill.addView(FrameLayout(context).apply {
      background = roundedBg(micCircleBg, 999f)
      layoutParams = LayoutParams(dp(32), dp(32)).apply { marginEnd = dp(10) }
      isClickable = true
      isFocusable = true
      addView(ImageView(context).apply {
        setImageResource(leftIconRes)
        setColorFilter(Color.WHITE)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        val inset = dp(7)
        setPadding(inset, inset, inset, inset)
        layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        )
        isClickable = false
        isFocusable = false
      })
      setOnTouchListener(TapTouch { leftAction() })
    })

    val waveform = AudioWaveformView(context).apply {
      barColor = if (isSttRecording) Color.WHITE else fg
      layoutParams = LayoutParams(0, dp(28), 1f)
    }
    sttWaveformView = waveform
    pill.addView(waveform)

    val timerText = if (isSttRecording) {
      formatRecDuration(System.currentTimeMillis() - sttRecordStartMs)
    } else {
      formatRecDuration(sttRecordDurationMs)
    }
    val timer = TextView(context).apply {
      text = timerText
      setTextColor(muted)
      textSize = (fontSize - 2f).coerceAtLeast(11f)
      typeface = keyTypeface
      gravity = Gravity.CENTER_VERTICAL
      layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
        marginStart = dp(10)
        marginEnd = dp(8)
      }
    }
    sttRecordTimerView = timer
    pill.addView(timer)

    if (!isSttRecording && hasShareableRecording()) {
      pill.addView(FrameLayout(context).apply {
        background = roundedBg(micCircleBg, 999f)
        layoutParams = LayoutParams(dp(28), dp(28)).apply { marginEnd = dp(6) }
        isClickable = true
        isFocusable = true
        addView(ImageView(context).apply {
          setImageResource(R.drawable.ic_audio_share)
          setColorFilter(Color.WHITE)
          scaleType = ImageView.ScaleType.CENTER_INSIDE
          val inset = dp(7)
          setPadding(inset, inset, inset, inset)
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
          isClickable = false
          isFocusable = false
        })
        setOnTouchListener(TapTouch { shareRecordingAudio() })
      })
    }

    pill.addView(FrameLayout(context).apply {
      background = roundedBg(micCircleBg, 999f)
      layoutParams = LayoutParams(dp(28), dp(28))
      isClickable = !isSttTranscribing
      isFocusable = !isSttTranscribing
      alpha = if (isSttTranscribing) 0.4f else 1f
      addView(ImageView(context).apply {
        setImageResource(R.drawable.ic_audio_close)
        setColorFilter(Color.WHITE)
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        val inset = dp(7)
        setPadding(inset, inset, inset, inset)
        layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        )
        isClickable = false
        isFocusable = false
      })
      if (!isSttTranscribing) {
        setOnTouchListener(TapTouch {
          stopAudioMenuPlayback()
          discardSttRecording()
          rebuild()
        })
      }
    })

    return pill
  }

  private fun audioMenuGenerateChip(fg: Int, accent: Int, muted: Int): FrameLayout {
    val showSpinner = isSttTranscribing
    val enabled = !isSttTranscribing && (isSttRecording || hasSttRecordedAudio())

    val frame = FrameLayout(context).apply {
      background = roundedBg(if (showSpinner || enabled) accent else color("key", "#2C2C31"), 999f)
      layoutParams = LayoutParams(dp(34), dp(34))
      alpha = if (showSpinner || enabled) 1f else 0.5f
      isClickable = enabled
      isFocusable = enabled
    }

    if (showSpinner) {
      frame.addView(android.widget.ProgressBar(context).apply {
        isIndeterminate = true
        indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
        layoutParams = FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER)
      })
    } else {
      frame.addView(ImageView(context).apply {
        setImageResource(R.drawable.ic_audio_send)
        setColorFilter(if (enabled) Color.WHITE else fg)
        contentDescription = "Generate transcription"
        scaleType = ImageView.ScaleType.CENTER_INSIDE
        val inset = dp(8)
        setPadding(inset, inset, inset, inset)
        layoutParams = FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        )
        isClickable = false
        isFocusable = false
      })
    }

    if (enabled) {
      frame.setOnTouchListener(TapTouch {
        if (isSttRecording) stopSttRecordingAndTranscribe() else transcribeRecordedFile()
      })
    }
    return frame
  }

  private fun audioMenuBackChip(bg: Int, fg: Int): ImageView =
    ImageView(context).apply {
      setImageResource(R.drawable.ic_audio_back)
      setColorFilter(fg)
      contentDescription = "Close audio menu"
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      background = roundedBg(bg, 999f)
      val inset = dp(8)
      setPadding(inset, inset, inset, inset)
      layoutParams = LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(6) }
      isClickable = true
      isFocusable = true
      setOnTouchListener(TapTouch { closeAudioMenu() })
    }

  private fun audioMenuLiveChip(bg: Int, fg: Int, accent: Int): ImageView =
    ImageView(context).apply {
      setImageResource(R.drawable.ic_audio_live)
      setColorFilter(fg)
      contentDescription = "Live transcription"
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      background = roundedBg(bg, 999f)
      val inset = dp(8)
      setPadding(inset, inset, inset, inset)
      layoutParams = LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(8) }
      val disabled = isSttRecording || isSttTranscribing
      isEnabled = !disabled
      alpha = if (disabled) 0.4f else 1f
      isClickable = !disabled
      isFocusable = !disabled
      if (!disabled) {
        setOnTouchListener(TapTouch {
          stopAudioMenuPlayback()
          discardSttRecording()
          isAudioMenuOpen = false
          sttCapturedText = ""
          sttLastCommitted = ""
          sttShouldAutoStart = true
          featureMode = FeatureMode.STT
          mainHandler.post { rebuild() }
        })
      }
    }

  private fun closeAudioMenu() {
    stopAudioMenuPlayback()
    if (isSttRecording) discardSttRecording() else discardSttRecording()
    isAudioMenuOpen = false
    mainHandler.post { rebuild() }
  }

  private fun discardSttRecording() {
    if (isSttRecording) {
      val recorder = sttRecorder
      sttRecorder = null
      runCatching { recorder?.stop() }
      runCatching { recorder?.release() }
      stopSttRecordTicker()
      isSttRecording = false
    }
    sttRecordedFile?.let { runCatching { it.delete() } }
    sttRecordedFile = null
    sttRecordedAudioBytes = null
    sttRecordDurationMs = 0L
    sttRecordStartMs = 0L
  }

  private fun toggleAudioMenuPlayback() {
    if (isAudioMenuPlaying) {
      stopAudioMenuPlayback()
      rebuild()
      return
    }
    val file = ensureSttRecordedFile() ?: return
    runCatching {
      val player = MediaPlayer().apply {
        setDataSource(file.absolutePath)
        setOnCompletionListener {
          isAudioMenuPlaying = false
          stopAudioMenuPlayback()
          mainHandler.post { rebuild() }
        }
        setOnErrorListener { _, _, _ ->
          isAudioMenuPlaying = false
          stopAudioMenuPlayback()
          mainHandler.post { rebuild() }
          true
        }
        prepare()
        start()
      }
      audioMenuPlayer = player
      isAudioMenuPlaying = true
      rebuild()
    }.onFailure { Log.w(TAG, "Audio playback failed", it) }
  }

  private fun hasSttRecordedAudio(): Boolean =
    sttRecordedAudioBytes?.isNotEmpty() == true ||
      sttRecordedFile?.let { it.exists() && it.length() > 0L } == true

  private fun sttAudioBytesForRequest(): ByteArray? {
    sttRecordedAudioBytes?.takeIf { it.isNotEmpty() }?.let { return it }
    val file = sttRecordedFile?.takeIf { it.exists() && it.length() > 0L } ?: return null
    return runCatching { file.readBytes() }
      .getOrNull()
      ?.takeIf { it.isNotEmpty() }
      ?.also { sttRecordedAudioBytes = it }
  }

  private fun ensureSttRecordedFile(): java.io.File? {
    sttRecordedFile?.takeIf { it.exists() && it.length() > 0L }?.let { return it }
    val bytes = sttRecordedAudioBytes?.takeIf { it.isNotEmpty() } ?: return null
    return runCatching {
      java.io.File.createTempFile("hypa_stt_retry_", ".m4a", context.cacheDir).also { file ->
        file.writeBytes(bytes)
        sttRecordedFile = file
      }
    }.getOrNull()
  }

  private fun stopAudioMenuPlayback() {
    val player = audioMenuPlayer
    audioMenuPlayer = null
    isAudioMenuPlaying = false
    runCatching { player?.stop() }
    runCatching { player?.release() }
  }

  private fun translateLanguageChip(
    labelText: String,
    bg: Int,
    fg: Int,
    onClick: (View) -> Unit,
  ): TextView =
    TextView(context).apply {
      text = labelText
      setTextColor(fg)
      textSize = (fontSize - 2f).coerceAtLeast(10f)
      typeface = keyTypeface
      gravity = Gravity.CENTER
      minHeight = dp(30)
      background = roundedBg(bg, 999f)
      setPadding(dp(10), dp(6), dp(10), dp(6))
      layoutParams =
        LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
          marginEnd = dp(6)
        }
      setOnTouchListener(TapTouch(ignoreWhen = { isTranslating }) { view -> onClick(view) })
    }

  private fun translateIconChip(
    bg: Int,
    fg: Int,
    enabled: Boolean = true,
    onClick: () -> Unit,
  ): FrameLayout =
    FrameLayout(context).apply {
      background = roundedBg(bg, 999f)
      alpha = if (enabled) 1f else 0.4f
      contentDescription = "Swap languages"
      layoutParams =
        LayoutParams(dp(30), dp(30)).apply {
          marginEnd = dp(6)
        }
      addView(
        ImageView(context).apply {
          setImageResource(R.drawable.ic_swap_horizontal)
          setColorFilter(fg)
          scaleType = ImageView.ScaleType.FIT_CENTER
          val inset = dp(6)
          setPadding(inset, inset, inset, inset)
          layoutParams =
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
        },
      )
      if (enabled) {
        setOnTouchListener(TapTouch(ignoreWhen = { isTranslating }) { onClick() })
      }
    }

  private fun clearTranslationThinkingState() {
    thinkingRequestGeneration += 1
    isTranslationThinkingLoading = false
    latestTranslationThinking = null
    lastExplainableTranslation = null
    lastSentTranslationSourceText = null
  }

  private fun discardTranslationUndo(refreshUi: Boolean = true): Boolean {
    val hadUndo = lastTranslationState != null
    val wasTranslating = isTranslating
    if (!hadUndo && !wasTranslating) return false
    translationMutationGeneration += 1
    lastTranslationState = null
    clearTranslationThinkingState()
    activeTranslationDocumentSnapshot = null
    if (wasTranslating) isTranslating = false
    if (refreshUi && featureMode == FeatureMode.TRANSLATE && !pickerSearchActive) {
      rebuild()
    }
    return true
  }

  private fun suppressTranslationUndoHostSync() {
    suppressTranslationUndoHostSyncUntil = SystemClock.uptimeMillis() + 500L
  }

  private fun syncTranslationUndoWithHostDocument() {
    if (!isTranslating && lastTranslationState == null) return

    val document =
      inputSupplier()
        ?.getExtractedText(ExtractedTextRequest(), 0)
        ?.text
        ?.toString() ?: return

    if (isTranslating) {
      val expectedDocument = activeTranslationDocumentSnapshot
      if (expectedDocument != null && document != expectedDocument) {
        discardTranslationUndo()
        return
      }
    }

    val expectedDocument = lastTranslationState?.resultingDocument ?: return
    if (SystemClock.uptimeMillis() < suppressTranslationUndoHostSyncUntil) return
    if (document != expectedDocument) {
      discardTranslationUndo()
    }
  }

  private fun isCurrentTranslationGeneration(generation: Int): Boolean =
    generation == translationMutationGeneration

  private fun armTranslationUndo(state: LastTranslationState?) {
    activeTranslationDocumentSnapshot = null
    lastTranslationState = state
    if (state != null) suppressTranslationUndoHostSync()
  }

  private fun triggerTranslate(preferredSource: String? = null) {
    if (isTranslating) return

    val token = apiToken.trim()
    val input = inputSupplier()
    if (input == null) {
      Log.i(TAG, "MT skipped: no active input connection")
      showToolbarError(ToolbarErrorSlot.TRANSLATE, KeyboardErrorCatalog.typeOrSelectText)
      return
    }

    val sourceText =
      preferredSource?.trim()?.takeIf { it.isNotEmpty() }
        ?: translationSourceText(input).ifBlank { lastFailedTranslationSourceText }
    if (sourceText.isEmpty()) {
      Log.i(TAG, "MT skipped: no source text")
      showToolbarError(ToolbarErrorSlot.TRANSLATE, KeyboardErrorCatalog.typeOrSelectText)
      return
    }

    lastFailedTranslationSourceText = sourceText
    lastSentTranslationSourceText = sourceText
    latestTranslationThinking = null
    lastExplainableTranslation = null
    isTranslationThinkingLoading = false
    thinkingRequestGeneration += 1
    isTranslating = true
    translationMutationGeneration += 1
    val generation = translationMutationGeneration
    activeTranslationDocumentSnapshot =
      input.getExtractedText(ExtractedTextRequest(), 0)?.text?.toString()
    rebuild()

    Thread {
      val result = runCatching {
        translationService.translate(
          token = token,
          sourceText = sourceText,
          sourceLanguageName = sourceLanguageName,
          targetLanguageName = targetLanguageName,
          provider = translationProvider,
          model = translationModel,
        )
      }
      mainHandler.post {
        if (!isCurrentTranslationGeneration(generation)) return@post
        isTranslating = false
        activeTranslationDocumentSnapshot = null
        result.fold(
          onSuccess = { payload ->
            lastFailedTranslationSourceText = ""
            latestTranslationThinking = payload.thinkingText
            if (payload.translatedText.isNotBlank()) {
              applyDetectedSourceLanguage(payload.detectedLanguage)
              lastExplainableTranslation =
                ExplainableTranslation(
                  sourceText = sourceText,
                  translatedText = payload.translatedText,
                  sourceLang = sourceLanguageName,
                  targetLang = targetLanguageName,
                  clientRequestId = payload.clientRequestId,
                )
              val translationState = captureTranslationState(input, payload.translatedText)
              armTranslationUndo(
                if (applyTranslatedText(input, payload.translatedText)) translationState else null,
              )
              rebuild()

              if (autoSpeakTranslationsKeyboard) {
                startTts(
                  overrideText = payload.translatedText,
                  overrideLanguageName = targetLanguageName,
                  restart = true,
                )
              }
            } else {
              showToolbarError(ToolbarErrorSlot.TRANSLATE, KeyboardErrorCatalog.noTranslation)
            }
          },
          onFailure = {
            Log.w(TAG, "Translation failed", it)
            showToolbarError(ToolbarErrorSlot.TRANSLATE, KeyboardErrorCatalog.from(it))
          },
        )
      }
    }.start()
  }

  private fun translationSourceText(input: InputConnection): String {
    val selectedText = input.getSelectedText(0)?.toString()?.trim().orEmpty()
    if (selectedText.isNotEmpty()) return selectedText

    val extracted = input.getExtractedText(ExtractedTextRequest(), 0)?.text?.toString()?.trim().orEmpty()
    if (extracted.isNotEmpty()) return extracted

    return input.getTextBeforeCursor(4000, 0)?.toString()?.trim().orEmpty()
  }

  private fun applyTranslatedText(input: InputConnection, translatedText: String): Boolean {
    val selectedText = input.getSelectedText(0)
    if (!selectedText.isNullOrEmpty()) {
      return textEngine.commitText(input, translatedText)
    }

    val extracted = input.getExtractedText(ExtractedTextRequest(), 0)?.text?.toString().orEmpty()
    if (extracted.isNotBlank()) {
      val beforeLength = input.getTextBeforeCursor(4000, 0)?.length ?: 0
      val afterLength = input.getTextAfterCursor(4000, 0)?.length ?: 0
      return textEngine.replaceSurroundingText(input, beforeLength, afterLength, translatedText)
    }

    return textEngine.commitText(input, translatedText)
  }

  private fun captureTranslationState(
    input: InputConnection,
    translatedText: String,
  ): LastTranslationState? {
    val extracted = input.getExtractedText(ExtractedTextRequest(), 0) ?: return null
    val document = extracted.text?.toString() ?: return null
    val selectionStart = extracted.selectionStart
    val selectionEnd = extracted.selectionEnd
    val start = minOf(selectionStart, selectionEnd)
    val end = maxOf(selectionStart, selectionEnd)

    if (start != end && start >= 0 && end <= document.length) {
      val selectedText = document.substring(start, end)
      return LastTranslationState(
        originalText = selectedText,
        translatedText = translatedText,
        translatedStart = start,
        translatedEnd = start + translatedText.length,
        resultingDocument =
          document.substring(0, start) + translatedText + document.substring(end),
      )
    }

    if (document.isNotEmpty()) {
      return LastTranslationState(
        originalText = document,
        translatedText = translatedText,
        translatedStart = 0,
        translatedEnd = translatedText.length,
        resultingDocument = translatedText,
      )
    }

    return null
  }

  private fun undoTranslation() {
    val state = lastTranslationState ?: return
    translationMutationGeneration += 1
    lastTranslationState = null
    clearTranslationThinkingState()
    val input = inputSupplier()
    if (input != null) {
      val extracted = input.getExtractedText(ExtractedTextRequest(), 0)
      val document = extracted?.text?.toString()
      val start = state.translatedStart
      val end = state.translatedEnd
      if (
        document != null &&
          document == state.resultingDocument &&
          start >= 0 &&
          end >= start &&
          end <= document.length &&
          document.substring(start, end) == state.translatedText &&
          input.setSelection(start, end)
      ) {
        textEngine.commitText(input, state.originalText)
      }
    }
    rebuild()
  }

  private fun supportsTranslationThinking(): Boolean =
    KeyboardLanguageCatalog.resolveTranslation(translationProvider, translationModel)
      .provider.equals("hypaai", ignoreCase = true)

  private fun canShowTranslationThinking(): Boolean =
    lastExplainableTranslation != null && supportsTranslationThinking()

  private fun openTranslationThinking() {
    featureMode = FeatureMode.THINKING_VIEW
    rebuild()
    requestTranslationThinkingIfNeeded()
  }

  private fun requestTranslationThinkingIfNeeded() {
    if (!latestTranslationThinking.isNullOrBlank()) return
    if (!supportsTranslationThinking()) return
    val pair = lastExplainableTranslation ?: return
    if (isTranslationThinkingLoading) return
    thinkingRequestGeneration += 1
    val generation = thinkingRequestGeneration
    isTranslationThinkingLoading = true
    rebuild()
    val token = apiToken.trim()
    Thread {
      val result =
        runCatching {
          translationService.generateThinking(
            token = token,
            sourceText = pair.sourceText,
            translatedText = pair.translatedText,
            sourceLanguageName = pair.sourceLang,
            targetLanguageName = pair.targetLang,
            provider = translationProvider,
            model = translationModel,
            clientRequestId = pair.clientRequestId,
          )
        }
      mainHandler.post {
        if (generation != thinkingRequestGeneration) return@post
        isTranslationThinkingLoading = false
        result.fold(
          onSuccess = { thinking ->
            latestTranslationThinking = thinking
            if (featureMode == FeatureMode.THINKING_VIEW) rebuild()
          },
          onFailure = {
            Log.w(TAG, "Translation thinking failed", it)
            showToolbarError(ToolbarErrorSlot.TRANSLATE, KeyboardErrorCatalog.from(it))
            if (featureMode == FeatureMode.THINKING_VIEW) rebuild()
          },
        )
      }
    }.start()
  }

  private fun applyDetectedSourceLanguage(detected: String?) {
    if (
      !TranslationService.isAutoDetectLanguage(sourceLanguageName) &&
        !TranslationService.isAutoDetectLanguage(sourceLanguageCode)
    ) {
      return
    }
    val language =
      TranslationService.resolveDetectedSourceLanguage(detected, supportedSourceLanguages())
        ?: return
    if (TranslationService.isAutoDetectLanguage(language.name)) return
    sourceLanguageCode = language.code
    sourceLanguageName = language.name
    persistCurrentTranslateLanguages()
  }

  private fun canSwapTranslateLanguages(): Boolean {
    if (TranslationService.isAutoDetectLanguage(sourceLanguageName) || TranslationService.isAutoDetectLanguage(sourceLanguageCode)) {
      return false
    }
    if (TranslationService.isAutoDetectLanguage(targetLanguageName) || TranslationService.isAutoDetectLanguage(targetLanguageCode)) {
      return false
    }
    if (sourceLanguageCode.equals(targetLanguageCode, ignoreCase = true)) return false
    if (sourceLanguageName.equals(targetLanguageName, ignoreCase = true)) return false
    return true
  }

  private fun swapTranslateLanguages(rebuildUi: Boolean = true) {
    if (!canSwapTranslateLanguages()) return

    val previousCode = sourceLanguageCode
    val previousName = sourceLanguageName
    sourceLanguageCode = targetLanguageCode
    sourceLanguageName = targetLanguageName
    targetLanguageCode = previousCode
    targetLanguageName = previousName

    if (TranslationService.isAutoDetectLanguage(targetLanguageName) || TranslationService.isAutoDetectLanguage(targetLanguageCode)) {
      val fallback =
        supportedTargetLanguages().firstOrNull {
          !it.code.equals(sourceLanguageCode, ignoreCase = true)
        } ?: KeyboardLanguageCatalog.defaultTargetLanguage
      targetLanguageCode = fallback.code
      targetLanguageName = fallback.name
    }

    persistCurrentTranslateLanguages()
    discardTranslationUndo(refreshUi = false)
    if (rebuildUi) rebuild()
  }

  private fun translateActionIcon(bg: Int, fg: Int, activeTint: Int): FrameLayout =
    FrameLayout(context).apply {
      background = roundedBg(if (isTranslating) activeTint else bg, 999f)
      layoutParams =
        LayoutParams(dp(32), dp(32)).apply {
          marginStart = dp(4)
        }
      if (isTranslating) {
        addView(
          ProgressBar(context).apply {
            isIndeterminate = true
            indeterminateTintList = android.content.res.ColorStateList.valueOf(fg)
            layoutParams = FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER)
          },
        )
      } else {
        addView(
          ImageView(context).apply {
            setImageResource(
              if (lastTranslationState != null) R.drawable.ic_audio_undo
              else R.drawable.ic_mode_translate,
            )
            if (lastTranslationState != null) setColorFilter(fg) else clearColorFilter()
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams =
              FrameLayout.LayoutParams(dp(16), dp(16), Gravity.CENTER)
          },
        )
      }
      contentDescription = when {
        isTranslating -> "Translating"
        lastTranslationState != null -> "Undo translation"
        else -> "Translate"
      }
      setOnTouchListener(TapTouch(ignoreWhen = { isTranslating }) {
        if (lastTranslationState != null) undoTranslation() else triggerTranslate()
      })
    }

  private fun dictionaryActionIcon(bg: Int, fg: Int, activeTint: Int): FrameLayout =
    FrameLayout(context).apply {
      background = roundedBg(if (isDictionaryLoading) activeTint else bg, 999f)
      layoutParams =
        LayoutParams(dp(32), dp(32)).apply {
          marginStart = dp(4)
        }
      if (isDictionaryLoading) {
        addView(
          ProgressBar(context).apply {
            isIndeterminate = true
            indeterminateTintList = android.content.res.ColorStateList.valueOf(fg)
            layoutParams = FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER)
          },
        )
      } else {
        addView(
          ImageView(context).apply {
            setImageResource(R.drawable.hypa_dictionary)
            clearColorFilter()
            scaleType = ImageView.ScaleType.FIT_CENTER
            layoutParams =
              FrameLayout.LayoutParams(dp(16), dp(16), Gravity.CENTER)
          },
        )
      }
      contentDescription = if (isDictionaryLoading) "Looking up" else "Lookup word"
      setOnTouchListener(TapTouch(ignoreWhen = { isDictionaryLoading }) { triggerDictionaryLookup() })
    }

  private fun triggerDictionaryLookup(preferredWord: String? = null) {
    if (isDictionaryLoading) return
    val input = inputSupplier() ?: run {
      Log.i(TAG, "Dictionary skipped: no active input connection")
      showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.noWord)
      return
    }
    val word = preferredWord?.trim() ?: dictionarySourceText(input)
    if (word.isBlank()) {
      Log.i(TAG, "Dictionary skipped: no source word")
      showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.noWord)
      return
    }

    isDictionaryLoading = true
    lastSentDictionarySourceText = word
    val requestId = ++dictionaryLookupRequestId
    rebuild()

    Thread {
      val result = runCatching { dictionaryService.lookup(word, dictionaryLanguageName, dictionaryProvider, dictionaryModel, apiToken) }
      mainHandler.post {
        if (requestId != dictionaryLookupRequestId) return@post
        isDictionaryLoading = false
        result.fold(
          onSuccess = { payload ->
            latestDictionaryResult = payload
            featureMode = FeatureMode.DICTIONARY_RESULT
            rebuild()
          },
          onFailure = {
            Log.w(TAG, "Dictionary lookup failed", it)
            latestDictionaryResult = null
            showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.from(it))
          },
        )
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun dictionarySourceText(input: InputConnection): String {
    val selectedText = input.getSelectedText(0)?.toString()?.trim().orEmpty()
    if (selectedText.isNotEmpty()) return selectedText

    val before = input.getTextBeforeCursor(128, 0)?.toString().orEmpty()
    val after = input.getTextAfterCursor(128, 0)?.toString().orEmpty()
    val left = before.takeLastWhile(::isDictionaryWordCharacter)
    val right = after.takeWhile(::isDictionaryWordCharacter)
    val combined = (left + right).trim()
    if (combined.isNotEmpty()) return combined

    val extracted = input.getExtractedText(ExtractedTextRequest(), 0)?.text?.toString()?.trim().orEmpty()
    if (extracted.isNotEmpty()) return extracted

    return before.trim()
  }

  private fun isDictionaryWordCharacter(ch: Char): Boolean =
    ch.isLetterOrDigit() || ch == '\'' || ch == '-' || ch == '_'

  private fun autoLookupAfterDictionaryLanguageChange(previousCode: String) {
    if (!autoLookupOnLanguageChange) return
    if (dictionaryLanguageCode.equals(previousCode, ignoreCase = true)) return
    val word = lastSentDictionarySourceText?.trim().orEmpty()
    if (word.isEmpty()) return
    triggerDictionaryLookup(preferredWord = word)
  }

  private fun thinkingIconChip(bg: Int, fg: Int, activeTint: Int): FrameLayout =
    FrameLayout(context).apply {
      background = roundedBg(bg, 999f)
      layoutParams =
        LayoutParams(dp(32), dp(32)).apply {
          marginEnd = dp(6)
        }
      addView(
        ImageView(context).apply {
          setImageResource(R.drawable.ic_thinking_brain)
          setColorFilter(activeTint.takeIf { featureMode == FeatureMode.THINKING_VIEW } ?: fg)
          scaleType = ImageView.ScaleType.CENTER_INSIDE
          val inset = dp(7)
          setPadding(inset, inset, inset, inset)
          layoutParams =
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
        },
      )
      contentDescription = "Translation thinking"
      setOnTouchListener(TapTouch {
        openTranslationThinking()
      })
    }

  private fun buildKeyBoard(): LinearLayout =
    renderBoard(
      renderModelEngine.buildBoard(
        mode = actionEngine.keyboardBoardMode(),
        languageCode = keyboardLanguageCode,
        forceEmail = typingEngine.forceEmail,
        wantsDotCom = typingEngine.wantsDotCom,
        returnAction = typingEngine.returnAction,
        symbolPage = typingEngine.symbolPage,
      ),
    )

  private fun renderBoard(board: KeyboardRenderBoard): LinearLayout {
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val col = BoardColumn()
    board.rows.forEach { rowModel ->
      col.addView(
        boardRow {
          rowModel.keys.forEach { key ->
            val view = renderBoardKey(key, keyBg, label, accent)
            if (key.type != KeyboardRenderKeyType.SPACER) {
              view.elevation = KEY_ELEVATION_DP * density
              boardKeyViews.add(view)
            }
            if (key.type == KeyboardRenderKeyType.LETTER) {
              boardLetters[view] = TextNormalizer.normalize(key.value ?: key.label.orEmpty())
            }
            addView(view)
          }
        },
      )
    }
    boardRootView = col
    return col
  }

  private inner class BoardColumn : LinearLayout(context) {
    init {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      clipChildren = false
      clipToPadding = false
    }

    override fun dispatchDraw(canvas: Canvas) {
      super.dispatchDraw(canvas)
      if (showHitSlopOverlay) drawHitSlop(canvas)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
      val action = ev.actionMasked
      if (action != MotionEvent.ACTION_DOWN && action != MotionEvent.ACTION_POINTER_DOWN) {
        return super.dispatchTouchEvent(ev)
      }
      val pointer = ev.actionIndex
      val x = ev.getX(pointer)
      val y = ev.getY(pointer)
      val nearest = keyViewAtLocal(x, y) ?: return super.dispatchTouchEvent(ev)
      val key = likelyKeyAt(nearest, x, y)
      if (key === nearest) tapRedirects.remove(key) else tapRedirects[key] = nearest
      val row = key.parent as? View ?: return super.dispatchTouchEvent(ev)
      val dx = nudgeInto(x, row.left + key.left, row.left + key.right)
      val dy = nudgeInto(y, row.top + key.top, row.top + key.bottom)
      if (dx == 0f && dy == 0f) return super.dispatchTouchEvent(ev)
      ev.offsetLocation(dx, dy)
      val handled = super.dispatchTouchEvent(ev)
      ev.offsetLocation(-dx, -dy)
      return handled
    }
  }

  private fun likelyKeyAt(nearest: View, x: Float, y: Float): View {
    if (nearest !in boardLetters) return nearest
    val prior = currentLetterPrior()
    if (prior.isEmpty()) return nearest
    fun offset(key: View): Pair<Float, Float> {
      val row = key.parent as View
      val dx = (x - (row.left + key.left + key.width / 2f)) / key.width
      val dy = (y - (row.top + key.top + key.height / 2f)) / key.height
      return dx to dy
    }
    val (nx, ny) = offset(nearest)
    if (abs(nx) < TAP_CORE && abs(ny) < TAP_CORE) return nearest
    return boardLetters.keys
      .filter { key -> offset(key).let { (dx, dy) -> abs(dx) <= TAP_REACH && abs(dy) <= TAP_REACH } }
      .maxByOrNull { key ->
        val (dx, dy) = offset(key)
        TAP_PRIOR_WEIGHT * ln(prior[boardLetters.getValue(key)] ?: 0f) -
          (dx * dx + dy * dy) / (2 * TAP_SPREAD * TAP_SPREAD)
      } ?: nearest
  }

  private fun currentLetterPrior(): Map<String, Float> {
    val prefix = TextNormalizer.normalize(contextEngine.snapshot().currentWord)
    val letters = boardLetters.values.toSet()
    val barLetters =
      currentSuggestions
        .map(TextNormalizer::normalize)
        .filter { it.length > prefix.length && it.startsWith(prefix) }
        .map { it[prefix.length].toString() }
        .filter { it in letters }
    val key = prefix + '|' + barLetters.joinToString("")
    if (key == letterPriorKey) return letterPrior
    val counts = letters.associateWith {
      corpusStore.commonWithPrefix(prefix + it) + 2 * personalVocabulary.countWithPrefix(prefix + it)
    }
    val total = counts.values.sum()
    letterPriorKey = key
    letterPrior =
      if (total == 0 && barLetters.isEmpty()) emptyMap()
      else counts.mapValues { (letter, count) ->
        val dictionary = (count + 1f) / (total + letters.size)
        if (barLetters.isEmpty()) dictionary
        else (1 - TAP_BAR_SHARE) * dictionary + TAP_BAR_SHARE * barLetters.count { it == letter } / barLetters.size
      }
    return letterPrior
  }

  private fun nudgeInto(value: Float, start: Int, end: Int): Float =
    when {
      value < start -> start - value
      value >= end -> end - 1f - value
      else -> 0f
    }

  private fun drawHitSlop(canvas: Canvas) {
    val root = boardRootView ?: return
    val prior = currentLetterPrior()
    val maxChance = prior.values.maxOrNull() ?: 1f
    val step = dp(3)
    val cols = root.width / step + 1
    val rows = root.height / step + 1
    val owners = arrayOfNulls<View>(cols * rows)
    for (r in 0 until rows) {
      for (c in 0 until cols) {
        val x = c * step + step / 2f
        val y = r * step + step / 2f
        owners[r * cols + c] = keyViewAtLocal(x, y)?.let { likelyKeyAt(it, x, y) }
      }
    }
    for (r in 0 until rows) {
      for (c in 0 until cols) {
        val owner = owners[r * cols + c] ?: continue
        val left = (c * step).toFloat()
        val top = (r * step).toFloat()
        val chance = boardLetters[owner]?.let { prior[it] }
        hitAreaPaint.color =
          if (chance == null) 0x20F472B6
          else Color.argb((40 + 140 * chance / maxChance).toInt(), 34, 197, 94)
        canvas.drawRect(left, top, left + step, top + step, hitAreaPaint)
        if (c + 1 < cols && owners[r * cols + c + 1] !== owner) {
          canvas.drawLine(left + step, top, left + step, top + step, hitSlopPaint)
        }
        if (r + 1 < rows && owners[(r + 1) * cols + c] !== owner) {
          canvas.drawLine(left, top + step, left + step, top + step, hitSlopPaint)
        }
      }
    }
    for ((key, letter) in boardLetters) {
      val chance = prior[letter] ?: continue
      val row = key.parent as? View ?: continue
      canvas.drawText(
        "${(chance * 100).roundToInt()}%",
        (row.left + key.left + dp(3)).toFloat(),
        (row.top + key.top + dp(10)).toFloat(),
        hitLabelPaint,
      )
    }
  }

  private val hitAreaPaint = Paint()

  private val hitLabelPaint by lazy {
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 9f * density
    }
  }

  private val hitSlopPaint by lazy {
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = density
      color = 0xCC22D3EE.toInt()
    }
  }

  private fun renderBoardKey(
    key: KeyboardRenderKey,
    keyBg: Int,
    labelColor: Int,
    accent: Int,
  ): View =
    when (key.type) {
      KeyboardRenderKeyType.LETTER ->
        letterKey(
          ch = key.value ?: key.label.orEmpty(),
          weight = key.weight,
          keyBg = keyBg,
          labelColor = labelColor,
          hint = key.hint,
        )
      KeyboardRenderKeyType.SYMBOL ->
        symbolKey(
          symbol = key.value ?: key.label.orEmpty(),
          weight = key.weight,
          keyBg = keyBg,
          labelColor = labelColor,
        )
      KeyboardRenderKeyType.SPECIAL ->
        specialKey(
          text = key.label.orEmpty(),
          weight = key.weight,
          bg = keyBg,
          fg = labelColor,
          triggerOnDown = key.triggerOnDown,
          hint = key.hint,
          onLongPress = key.longPressAction?.let { held -> { performRenderAction(key.copy(action = held)) } },
        ) { _ ->
          performRenderAction(key)
        }
      KeyboardRenderKeyType.EMOJI ->
        iconKey(
          resId = key.iconRes ?: R.drawable.ic_emoji_smileys,
          weight = key.weight,
          bg = keyBg,
          fg = labelColor,
        ) { _ ->
          performRenderAction(key)
        }
      KeyboardRenderKeyType.ACTION ->
        iconKey(
          resId = key.iconRes ?: R.drawable.ic_key_done,
          weight = key.weight,
          bg = accent,
          fg = Color.WHITE,
        ) { _ ->
          performRenderAction(key)
        }
      KeyboardRenderKeyType.SHIFT -> shiftKey(key.weight, keyBg, labelColor)
      KeyboardRenderKeyType.DELETE -> deleteKey(key.weight, keyBg, labelColor)
      KeyboardRenderKeyType.SPACE -> spaceKey(key.weight, keyBg, labelColor)
      KeyboardRenderKeyType.SPACER ->
        View(context).apply {
          layoutParams = LayoutParams(0, keyHeightPx, key.weight)
        }
    }

  private fun performRenderAction(key: KeyboardRenderKey) {
    if (pickerSearchActive) {
      when (key.action) {
        KeyboardRenderAction.COMMIT_SYMBOL -> updatePickerSearchQuery(key.value.orEmpty())
        KeyboardRenderAction.COMMIT_COMMA -> updatePickerSearchQuery(",")
        KeyboardRenderAction.COMMIT_EMAIL_AWARE_COMMA_OR_AT -> updatePickerSearchQuery(",")
        KeyboardRenderAction.COMMIT_PERIOD -> updatePickerSearchQuery(".")
        KeyboardRenderAction.SPACE -> updatePickerSearchQuery(" ")
        KeyboardRenderAction.DELETE -> deletePickerSearchCharacter()
        else -> Unit
      }
      if (key.action == KeyboardRenderAction.SEARCH) {
        closePickerSearch()
      }
      return
    }

    when (key.action) {
      KeyboardRenderAction.COMMIT_LETTER -> Unit
      KeyboardRenderAction.COMMIT_SYMBOL ->
        applyActionResult(actionEngine.commitText(key.value.orEmpty()))
      KeyboardRenderAction.OPEN_SYMBOLS ->
        applyActionResult(actionEngine.openSymbols())
      KeyboardRenderAction.TOGGLE_SYMBOL_PAGE ->
        applyActionResult(actionEngine.toggleSymbolPage())
      KeyboardRenderAction.RETURN_TO_ALPHABET ->
        applyActionResult(actionEngine.returnToAlphabet())
      KeyboardRenderAction.COMMIT_COMMA ->
        applyActionResult(actionEngine.commitText(","))
      KeyboardRenderAction.COMMIT_PERIOD ->
        applyActionResult(actionEngine.commitText("."))
      KeyboardRenderAction.COMMIT_DOT_COM ->
        applyActionResult(actionEngine.commitText(".com"))
      KeyboardRenderAction.COMMIT_EMAIL_AWARE_COMMA_OR_AT ->
        applyActionResult(actionEngine.emailAwareCommaOrAt())
      KeyboardRenderAction.OPEN_EMOJI -> {
        openEmojiPanel()
        rebuild()
      }
      KeyboardRenderAction.SEARCH -> {
        discardTranslationUndo()
        onSearch()
        refreshAutoCaps()
      }
      KeyboardRenderAction.SHIFT -> Unit
      KeyboardRenderAction.DELETE -> Unit
      KeyboardRenderAction.SPACE -> Unit
    }
  }

  private fun row(block: LinearLayout.() -> Unit): LinearLayout =
    LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, dp(1), 0, dp(1))
      block()
    }

  private fun boardRow(block: LinearLayout.() -> Unit): LinearLayout =
    row(block).apply {
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
      clipChildren = false
      clipToPadding = false
    }

  private val keyMarginPx = dp(3)

  private fun weightedKeyLayoutParams(weight: Float): LayoutParams =
    LayoutParams(0, keyHeightPx, weight).apply {
      marginStart = keyMarginPx
      marginEnd = keyMarginPx
    }

  private fun keyTextSizeFor(display: String): Float {
    val visibleChars = visibleCharCount(display)
    return if (visibleChars > 1) 15.3f else 21.4f
  }

  private fun keyTextScaleXFor(display: String): Float {
    val visibleChars = visibleCharCount(display)
    return when {
      visibleChars >= 3 -> 0.76f
      visibleChars == 2 -> 0.86f
      else -> 1f
    }
  }

  private fun visibleCharCount(display: String): Int {
    val visibleChars =
      display.count { ch ->
        val type = Character.getType(ch)
        type != Character.NON_SPACING_MARK.toInt() &&
          type != Character.COMBINING_SPACING_MARK.toInt() &&
          type != Character.ENCLOSING_MARK.toInt()
      }
    return visibleChars
  }

  private fun initKeyLabelLayout(tv: TextView) {
    tv.maxLines = 1
    tv.minLines = 1
    tv.includeFontPadding = false
  }

  private fun applyKeyLabelSizing(tv: TextView, display: String) {
    tv.textSize = keyTextSizeFor(display)
    tv.textScaleX = keyTextScaleXFor(display)
  }

  private fun textBeforeCursor(): String =
    inputSupplier()?.getTextBeforeCursor(64, 0)?.toString().orEmpty()

  private fun refreshAutoCaps() {
    if (pickerSearchActive) return
    if (typingEngine.updateAutoCaps(contextEngine.snapshot().textBeforeCursor)) {
      updateLetterKeyLabels()
    }
  }

  private fun updateLetterKeyLabels() {
    val uppercase = typingEngine.isUppercaseActive()
    val locale = layoutEngine.caseLocale(keyboardLanguageCode)
    for (tv in letterKeyViews) {
      val ch = tv.tag as? String ?: continue
      val display = if (uppercase) ch.uppercase(locale) else ch.lowercase(locale)
      if (tv.text.toString() == display) continue
      tv.text = display
      applyKeyLabelSizing(tv, display)
    }
    shiftKeyView?.let(::applyShiftIcon)
  }

  private fun letterKey(
    ch: String,
    weight: Float,
    keyBg: Int,
    labelColor: Int,
    hint: String? = null,
  ): View {
    val locale = layoutEngine.caseLocale(keyboardLanguageCode)
    val lower = ch.lowercase(locale)
    val upper = ch.uppercase(locale)
    val uppercase = typingEngine.isUppercaseActive()
    val display = if (uppercase) upper else lower
    val accentVariants = letterVariantsFor(lower)
    val variants = if (!hint.isNullOrEmpty()) accentVariants + hint else accentVariants
    if (hint != null) {
      val labelView =
        TextView(context).apply {
          text = display
          setTextColor(labelColor)
          initKeyLabelLayout(this)
          applyKeyLabelSizing(this, display)
          typeface = keyTypeface
          gravity = Gravity.CENTER
          tag = lower
          isClickable = false
          isFocusable = false
          layoutParams =
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
      val frame =
        FrameLayout(context).apply {
          minimumHeight = keyHeightPx
          background = pressableKeyBg(keyBg, KEY_RADIUS_DP)
          layoutParams = weightedKeyLayoutParams(weight)
          addView(labelView)
          addView(
            TextView(context).apply {
              text = hint
              setTextColor(labelColor)
              textSize = 9.5f
              typeface = keyTypeface
              gravity = Gravity.CENTER
              alpha = 0.92f
              isClickable = false
              isFocusable = false
              layoutParams =
                FrameLayout.LayoutParams(dp(18), dp(16), Gravity.TOP or Gravity.END).apply {
                  topMargin = dp(1)
                  marginEnd = dp(1)
                }
            },
          )
          setOnTouchListener(
            KeyTouch(
              triggerOnDown = true,
              longPressAlternates = variants,
              replacementText = display,
              previewText = display,
              restoresShiftOnCancel = true,
            ) {
              if (pickerSearchActive) {
                updatePickerSearchQuery(if (typingEngine.isUppercaseActive()) upper else lower)
              } else {
                applyActionResult(actionEngine.commitLetter(lower, upper))
              }
            },
          )
        }
      letterKeyViews.add(labelView)
      return frame
    }
    val tv = touchKey(
      display,
      weight,
      keyBg,
      labelColor,
      variants,
      display,
      restoresShiftOnCancel = true,
    ) {
      if (pickerSearchActive) {
        updatePickerSearchQuery(if (typingEngine.isUppercaseActive()) upper else lower)
      } else {
        applyActionResult(actionEngine.commitLetter(lower, upper))
      }
    }
    tv.tag = lower
    letterKeyViews.add(tv)
    return tv
  }

  private fun symbolKey(symbol: String, weight: Float, keyBg: Int, labelColor: Int): TextView {
    val alternates = layoutEngine.punctuationAlternates(symbol)
    return touchKey(symbol, weight, keyBg, labelColor, alternates, symbol) {
      if (pickerSearchActive) {
        updatePickerSearchQuery(symbol)
      } else {
        applyActionResult(actionEngine.commitText(symbol))
      }
    }
  }

  private fun letterVariantsFor(base: String, state: ShiftState = typingEngine.shiftState()): List<String> {
    return layoutEngine.alternateKeys(
      keyboardLanguageCode, base,
      shifted = state != ShiftState.OFF,
      capsLocked = state == ShiftState.LOCKED,
    )
  }

  private fun specialKey(
    text: String,
    weight: Float,
    bg: Int,
    fg: Int,
    pillRadius: Float = KEY_RADIUS_DP,
    triggerOnDown: Boolean = false,
    hint: String? = null,
    onLongPress: (() -> Unit)? = null,
    onClick: (View) -> Unit,
  ): View {
    val label =
      TextView(context).apply {
        this.text = text
        setTextColor(fg)
        textSize = if (text == "Space") 10f else 13.3f
        typeface = keyTypeface
        gravity = Gravity.CENTER
        minHeight = keyHeightPx
        setPadding(dp(6), dp(4), dp(6), dp(4))
      }

    if (hint.isNullOrEmpty()) {
      return label.apply {
        background = pressableKeyBg(bg, pillRadius)
        layoutParams = weightedKeyLayoutParams(weight)
        setOnTouchListener(
          KeyTouch(triggerOnDown = triggerOnDown, onLongPress = onLongPress, onTrigger = onClick),
        )
      }
    }

    label.layoutParams =
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    return FrameLayout(context).apply {
      minimumHeight = keyHeightPx
      background = pressableKeyBg(bg, pillRadius)
      layoutParams = weightedKeyLayoutParams(weight)
      addView(label)
      addView(
        TextView(context).apply {
          this.text = hint
          setTextColor(fg)
          textSize = 9.5f
          typeface = keyTypeface
          gravity = Gravity.CENTER
          alpha = 0.92f
          isClickable = false
          isFocusable = false
          layoutParams =
            FrameLayout.LayoutParams(dp(18), dp(16), Gravity.TOP or Gravity.END).apply {
              topMargin = dp(1)
              marginEnd = dp(1)
            }
        },
      )
      setOnTouchListener(
        KeyTouch(triggerOnDown = triggerOnDown, onLongPress = onLongPress, onTrigger = onClick),
      )
    }
  }

  private fun iconKey(
    resId: Int,
    weight: Float,
    bg: Int,
    fg: Int,
    pillRadius: Float = KEY_RADIUS_DP,
    onClick: (View) -> Unit,
  ): ImageView =
    ImageView(context).apply {
      setImageResource(resId)
      setColorFilter(fg)
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      val inset = dp(8)
      setPadding(inset, inset, inset, inset)
      minimumHeight = keyHeightPx
      background = roundedBg(bg, pillRadius)
      layoutParams = weightedKeyLayoutParams(weight)
      setOnTouchListener(KeyTouch(triggerOnDown = true, onTrigger = onClick))
    }

  private fun spaceKey(weight: Float, bg: Int, fg: Int): TextView =
    TextView(context).apply {
      text = keyboardSpaceLabel()
      setTextColor(fg)
      textSize = fontSize
      setSingleLine(true)
      ellipsize = TextUtils.TruncateAt.END
      typeface = keyTypeface
      gravity = Gravity.CENTER
      minHeight = keyHeightPx
      background = pressableKeyBg(bg, KEY_RADIUS_DP)
      setPadding(dp(6), dp(4), dp(6), dp(4))
      layoutParams = weightedKeyLayoutParams(weight)
      setOnTouchListener(SpaceCursorTouch())
    }

  private fun deleteKey(weight: Float, bg: Int, fg: Int): ImageView =
    iconKey(
      iconRes = R.drawable.ic_key_backspace,
      weight = weight,
      bg = bg,
      tint = fg,
      contentDescriptionText = "Delete",
      iconSizeDp = 12,
    ).apply {
      setOnTouchListener(DeleteKeyTouch())
    }

  private fun shiftKey(weight: Float, bg: Int, fg: Int): ImageView =
    iconKey(
      iconRes = R.drawable.ic_key_shift_outline,
      weight = weight,
      bg = bg,
      tint = fg,
      contentDescriptionText = "Shift",
      iconSizeDp = 10,
    ).apply {
      shiftKeyView = this
      val insetX = dp(8)
      val insetY = dp(9)
      setPadding(insetX, insetY, insetX, insetY)
      applyShiftIcon(this)
      setOnTouchListener(TapTouch {
        playKeySound()
        applyActionResult(actionEngine.toggleShift(SystemClock.uptimeMillis()))
      })
    }

  private fun applyShiftIcon(icon: ImageView) {
    val state = typingEngine.shiftState()
    icon.setImageResource(
      when (state) {
        ShiftState.OFF -> R.drawable.ic_key_shift_outline
        ShiftState.ONCE -> R.drawable.ic_key_shift
        ShiftState.LOCKED -> R.drawable.ic_key_shift_lock
      },
    )
    val active = state != ShiftState.OFF
    icon.background =
      pressableKeyBg(
        if (active) color("accent", "#3B82F6") else color("key", "#2C2C31"),
        KEY_RADIUS_DP,
      )
    icon.setColorFilter(if (active) Color.WHITE else color("label", "#EAEAEE"))
    icon.contentDescription =
      when (state) {
        ShiftState.OFF -> "Shift"
        ShiftState.ONCE -> "Shift on"
        ShiftState.LOCKED -> "Caps lock on"
      }
  }

  private fun iconKey(
    iconRes: Int,
    weight: Float,
    bg: Int,
    tint: Int,
    contentDescriptionText: String,
    iconSizeDp: Int = 20,
    useWeight: Boolean = true,
  ): ImageView =
    ImageView(context).apply {
      setImageResource(iconRes)
      setColorFilter(tint)
      contentDescription = contentDescriptionText
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      minimumHeight = keyHeightPx
      minimumWidth = dp(18)
      background = pressableKeyBg(bg, KEY_RADIUS_DP)
      val inset = dp(4)
      setPadding(inset, inset, inset, inset)
      layoutParams =
        if (useWeight) {
          weightedKeyLayoutParams(weight)
        } else {
          LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
        }
    }

  private fun touchKey(
    display: String,
    weight: Float,
    keyBg: Int,
    labelColor: Int,
    longPressAlternates: List<String> = emptyList(),
    replacementText: String? = null,
    restoresShiftOnCancel: Boolean = false,
    onCommit: (View) -> Unit,
  ): TextView {
    val tv =
      TextView(context).apply {
        text = display
        setTextColor(labelColor)
        initKeyLabelLayout(this)
        applyKeyLabelSizing(this, display)
        typeface = keyTypeface
        gravity = Gravity.CENTER
        minHeight = keyHeightPx
        background = pressableKeyBg(keyBg, KEY_RADIUS_DP)
        val horizontalPadding = if (visibleCharCount(display) > 1) dp(2) else dp(6)
        setPadding(horizontalPadding, dp(4), horizontalPadding, dp(4))
        layoutParams = weightedKeyLayoutParams(weight)
      }
    tv.setOnTouchListener(
      KeyTouch(
        triggerOnDown = true,
        longPressAlternates = longPressAlternates,
        replacementText = replacementText,
        previewText = display,
        restoresShiftOnCancel = restoresShiftOnCancel,
        onTrigger = onCommit,
      ),
    )
    return tv
  }

  private inner class KeyTouch(
    private val triggerOnDown: Boolean = false,
    private val longPressAlternates: List<String> = emptyList(),
    private val replacementText: String? = null,
    private val previewText: String? = null,
    private val restoresShiftOnCancel: Boolean = false,
    private val onLongPress: (() -> Unit)? = null,
    private val onTrigger: (View) -> Unit,
  ) : OnTouchListener {
    private var longPressRunnable: Runnable? = null
    private var longPressTriggered = false
    private var committedOnDown = false
    private var pressedShiftState = ShiftState.OFF
    private var pressedReplacementText: String? = null
    private var handedOffTo: View? = null

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      handedOffTo?.let { target ->
        forwardTo(target, event, event.action)
        if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
          handedOffTo = null
        }
        return true
      }
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          pressedShiftState = typingEngine.shiftState()
          pressedReplacementText = if (restoresShiftOnCancel) {
            val locale = layoutEngine.caseLocale(keyboardLanguageCode)
            if (pressedShiftState == ShiftState.OFF) replacementText?.lowercase(locale)
            else replacementText?.uppercase(locale)
          } else replacementText
          longPressTriggered = false
          committedOnDown = false
          handedOffTo = null
          applyPressedState(v, true)
          jankMonitor.onKeyDown()
          if (triggerOnDown) {
            val startedAt = if (BuildConfig.DEBUG) SystemClock.uptimeMillis() else 0L
            onTrigger(v)
            if (BuildConfig.DEBUG) {
              val commitMs = SystemClock.uptimeMillis() - startedAt
              if (commitMs >= 8L) Log.d(TAG, "keydown commit=${commitMs}ms")
            }
            committedOnDown = true
            playKeySound()
            pulse()
          }
          scheduleLongPress(v)
          previewText?.let { showKeyPreview(v, if (restoresShiftOnCancel) pressedReplacementText ?: it else it) }
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          if (longPressTriggered) {
            if (onLongPress == null) updateVariantSelection(event.rawX, event.rawY)
          } else {
            val stillInside = isWithinKeyBounds(v, event)
            applyPressedState(v, stillInside)
            if (!stillInside) {
              cancelLongPress()
              dismissKeyPreview(v)
              handOff(v, event)
            }
          }
          return true
        }

        MotionEvent.ACTION_UP -> {
          cancelLongPress()
          dismissKeyPreview(v)
          applyPressedState(v, false)
          if (longPressTriggered) {
            if (onLongPress == null) commitDraggedVariant()
            return true
          }
          if (committedOnDown) return true
          if (!isWithinKeyBounds(v, event)) {
            dismissVariantPopup()
            return true
          }
          onTrigger(v)
          playKeySound()
          pulse()
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          cancelLongPress()
          applyPressedState(v, false)
          dismissKeyPreview(v)
          if (BuildConfig.DEBUG && committedOnDown) {
            logHostEcho("cancel kept '$pressedReplacementText'")
          }
          dismissVariantPopup()
          return true
        }
      }
      return true
    }

    private fun scheduleLongPress(anchor: View) {
      val custom = onLongPress
      if (custom == null && (replacementText.isNullOrEmpty() || longPressAlternates.isEmpty())) return
      longPressRunnable =
        Runnable {
          longPressTriggered = true
          applyPressedState(anchor, false)
          pulse()
          dismissKeyPreview(anchor)
          if (custom != null) {
            custom()
          } else {
            showVariantPicker(
              anchor,
              pressedReplacementText.orEmpty(),
              if (restoresShiftOnCancel) {
                val base = replacementText.orEmpty().lowercase(Locale.ROOT)
                letterVariantsFor(base, pressedShiftState) +
                  longPressAlternates.drop(layoutEngine.alternateKeys(keyboardLanguageCode, base).size)
              } else longPressAlternates,
              restoresShiftOnCancel,
            )
          }
        }.also {
          mainHandler.postDelayed(it, longPressDurationMs)
        }
    }

    private fun cancelLongPress() {
      longPressRunnable?.let(mainHandler::removeCallbacks)
      longPressRunnable = null
    }

    private fun handOff(from: View, event: MotionEvent) {
      val target = keyViewAt(event.rawX, event.rawY) ?: return
      if (target === from) return
      if (committedOnDown) rollbackCommittedKey(pressedReplacementText, restoresShiftOnCancel, "handoff")
      committedOnDown = false
      handedOffTo = target
      forwardTo(target, event, MotionEvent.ACTION_DOWN)
    }

    private fun forwardTo(target: View, source: MotionEvent, action: Int) {
      target.getLocationOnScreen(touchLocationBuffer)
      val forwarded =
        MotionEvent.obtain(
          source.downTime,
          source.eventTime,
          action,
          source.rawX,
          source.rawY,
          source.metaState,
        )
      forwarded.offsetLocation(-touchLocationBuffer[0].toFloat(), -touchLocationBuffer[1].toFloat())
      target.dispatchTouchEvent(forwarded)
      forwarded.recycle()
    }
  }

  private fun showVariantPicker(
    anchor: View,
    replacementText: String,
    variants: List<String>,
    restoresShiftOnCancel: Boolean,
  ) {
    if (variants.isEmpty()) return
    dismissVariantPopup()

    val buttons = mutableListOf<TextView>()
    val popupContent =
      LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER
        background = roundedBg(color("toolbar", "#18181B"), 14f)
        setPadding(dp(6), dp(6), dp(6), dp(6))
        variants.forEachIndexed { index, variant ->
          val button =
            TextView(context).apply {
              text = variant
              setTextColor(color("label", "#EAEAEE"))
              textSize = fontSize + 1f
              textScaleX = keyTextScaleXFor(variant).coerceAtLeast(0.86f)
              maxLines = 1
              minLines = 1
              includeFontPadding = false
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minWidth = dp(40)
              minHeight = dp(44)
              background = roundedBg(color("key", "#2C2C31"), 10f)
              setPadding(dp(10), dp(8), dp(10), dp(8))
              layoutParams =
                LinearLayout.LayoutParams(
                  LinearLayout.LayoutParams.WRAP_CONTENT,
                  LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply {
                  if (index > 0) {
                    marginStart = dp(4)
                  }
                }
            }
          buttons += button
          addView(button)
        }
      }

    popupContent.measure(
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )

    val availableWidth = ((width.takeIf { it > 0 } ?: resources.displayMetrics.widthPixels) - dp(16))
      .coerceAtLeast(variants.size * dp(16))
    if (popupContent.measuredWidth > availableWidth) {
      val itemWidth = ((availableWidth - dp(12) - (buttons.size - 1) * dp(4)) / buttons.size)
        .coerceAtLeast(1)
      buttons.forEach { button ->
        button.minWidth = 0
        button.setPadding(dp(2), dp(8), dp(2), dp(8))
        button.layoutParams.width = itemWidth
        val textWidth = (button.paint.measureText(button.text.toString()) / button.textScaleX.coerceAtLeast(0.01f)).coerceAtLeast(1f)
        button.textScaleX = minOf(button.textScaleX, ((itemWidth - dp(4)).coerceAtLeast(1) / textWidth))
      }
      popupContent.measure(
        View.MeasureSpec.makeMeasureSpec(availableWidth, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      )
    }

    val popup =
      PopupWindow(
        popupContent,
        popupContent.measuredWidth,
        popupContent.measuredHeight,
        false,
      ).apply {
        isOutsideTouchable = true
        isTouchable = false
        elevation = dp(10).toFloat()
        setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
        setOnDismissListener {
          if (activeVariantPopup?.popup === this) {
            activeVariantPopup = null
          }
        }
      }

    activeVariantPopup =
      VariantPopupSession(
        popup = popup,
        replacementText = replacementText,
        variants = variants,
        buttons = buttons,
        restoresShiftOnCancel = restoresShiftOnCancel,
      )

    anchor.post {
      if (!anchor.isAttachedToWindow || activeVariantPopup?.popup !== popup) return@post
      val xOff = ((anchor.width - popupContent.measuredWidth) / 2f).roundToInt()
      val yOff = -(anchor.height + popupContent.measuredHeight + dp(10))
      popup.showAsDropDown(anchor, xOff, yOff)
      val location = IntArray(2)
      anchor.getLocationOnScreen(location)
      updateVariantSelection(location[0] + (anchor.width / 2f), location[1].toFloat())
    }
  }

  private fun replaceRecentCommittedText(original: String, replacement: String): Boolean {
    val replaced = textEngine.replaceRecentCommittedText(original, replacement)
    if (replaced) {
      contextEngine.resync()
      refreshAutoCaps()
      publishPredictionContext()
    }
    return replaced
  }

  private fun rollbackCommittedKey(text: String?, restoresShift: Boolean, reason: String) {
    val committed = text?.takeIf { it.isNotEmpty() } ?: return
    logHostEcho("rollback '$committed' on $reason")
    if (!replaceRecentCommittedText(committed, "")) return
    if (restoresShift) {
      typingEngine.restoreShiftAfterCancelledLetter()
      updateLetterKeyLabels()
    }
  }

  private fun updateVariantSelection(rawX: Float, rawY: Float) {
    val session = activeVariantPopup ?: return
    val hoveredIndex =
      session.buttons.indexOfFirst { button ->
        val location = IntArray(2)
        button.getLocationOnScreen(location)
        val left = location[0].toFloat()
        val top = location[1].toFloat()
        val right = left + button.width
        val bottom = top + button.height
        rawX in left..right && rawY in top..bottom
      }

    val selectedIndex =
      if (hoveredIndex >= 0) {
        hoveredIndex
      } else {
        val first = session.buttons.firstOrNull() ?: return
        val last = session.buttons.lastOrNull() ?: return
        val firstLocation = IntArray(2)
        first.getLocationOnScreen(firstLocation)
        val lastLocation = IntArray(2)
        last.getLocationOnScreen(lastLocation)
        val grace = dp(16).toFloat()
        val stripLeft = firstLocation[0] - grace
        val stripRight = lastLocation[0] + last.width + grace
        val stripTop = firstLocation[1] - grace
        val stripBottom = firstLocation[1] + first.height + grace
        if (rawX !in stripLeft..stripRight || rawY !in stripTop..stripBottom) {
          0
        } else {
          session.buttons
            .mapIndexed { index, button ->
              val location = IntArray(2)
              button.getLocationOnScreen(location)
              val centerX = location[0] + (button.width / 2f)
              index to kotlin.math.abs(centerX - rawX)
            }
            .minByOrNull { it.second }
            ?.first ?: -1
        }
      }

    if (selectedIndex == session.selectedIndex) return
    session.selectedIndex = selectedIndex
    session.buttons.forEachIndexed { index, button ->
      val isSelected = index == selectedIndex
      button.setTextColor(if (isSelected) Color.WHITE else color("label", "#EAEAEE"))
      button.background =
        roundedBg(
          if (isSelected) color("accent", "#3B82F6") else color("key", "#2C2C31"),
          10f,
        )
    }
  }

  private fun commitDraggedVariant() {
    val session = activeVariantPopup ?: return
    val replacement = session.variants.getOrNull(session.selectedIndex)
    if (!replacement.isNullOrEmpty()) {
      val input = inputSupplier()
      if (input != null && input.getSelectedText(0).isNullOrEmpty() &&
        input.getTextBeforeCursor(session.replacementText.length, 0)?.toString() == session.replacementText &&
        replaceRecentCommittedText(session.replacementText, replacement)) {
        val before = input.getTextBeforeCursor(128, 0)?.toString()
        val after = input.getTextAfterCursor(128, 0)?.toString()
        recentAlternateUnit = if (replacement.length > 1 && before != null && after != null && before.endsWith(replacement))
          AlternateUnit(replacement, before, after) else null
        playKeySound()
      }
    } else {
      rollbackCommittedKey(session.replacementText, session.restoresShiftOnCancel, "variant")
    }
    dismissVariantPopup()
  }

  private fun dismissVariantPopup() {
    activeVariantPopup?.popup?.dismiss()
    activeVariantPopup = null
  }

  private fun showKeyPreview(anchor: View, text: String) {
    val preview = keyPreview ?: KeyPreviewDrawable().also { keyPreview = it }
    keyPreviewOwner = anchor
    preview.text = text

    keyPreviewAnchorRect.set(0, 0, anchor.width, anchor.height)
    offsetDescendantRectToMyCoords(anchor, keyPreviewAnchorRect)
    val bubbleWidth = preview.widthFor(text).coerceAtLeast(anchor.width)
    val bubbleHeight = preview.height
    val left = (keyPreviewAnchorRect.centerX() - bubbleWidth / 2).coerceIn(0, (width - bubbleWidth).coerceAtLeast(0))
    val top = (keyPreviewAnchorRect.top - bubbleHeight - dp(6)).coerceAtLeast(0)

    keyPreviewLastBounds.set(preview.bounds)
    preview.setBounds(left, top, left + bubbleWidth, top + bubbleHeight)
    if (!isKeyPreviewShowing) {
      overlay.add(preview)
      isKeyPreviewShowing = true
      keyPreviewLastBounds.set(preview.bounds)
    }
    keyPreviewLastBounds.union(preview.bounds)
    invalidate(keyPreviewLastBounds)
  }

  private fun dismissKeyPreview(owner: View? = null) {
    if (owner != null && keyPreviewOwner !== owner) return
    keyPreviewOwner = null
    val preview = keyPreview ?: return
    if (!isKeyPreviewShowing) return
    overlay.remove(preview)
    isKeyPreviewShowing = false
    invalidate(preview.bounds)
  }

  private fun discardKeyPreview() {
    dismissKeyPreview()
    keyPreview = null
  }

  private inner class KeyPreviewDrawable : Drawable() {
    private val platePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color("toolbar", "#18181B") }
    private val glyphPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = color("label", "#EAEAEE")
        textAlign = Paint.Align.CENTER
        typeface = keyTypeface
        textSize =
          TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP,
            fontSize + 6f,
            resources.displayMetrics,
          )
      }
    private val plateRect = RectF()
    private val radius = dp(12).toFloat()

    var text: String = ""

    fun widthFor(value: String): Int = (glyphPaint.measureText(value) + 2 * dp(10)).toInt()

    val height: Int
      get() = glyphPaint.fontMetrics.let { (it.descent - it.ascent).toInt() + 2 * dp(6) }

    override fun draw(canvas: Canvas) {
      plateRect.set(bounds)
      canvas.drawRoundRect(plateRect, radius, radius, platePaint)
      val metrics = glyphPaint.fontMetrics
      val baseline = bounds.exactCenterY() - (metrics.ascent + metrics.descent) / 2f
      canvas.drawText(text, bounds.exactCenterX(), baseline, glyphPaint)
    }

    override fun setAlpha(alpha: Int) = Unit

    override fun setColorFilter(colorFilter: ColorFilter?) = Unit

    @Deprecated("Required by Drawable; the plate is opaque but the corners are not.")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }

  private inner class SpaceCursorTouch : OnTouchListener {
    private var longPressRunnable: Runnable? = null
    private var cursorMode = false
    private var committedOnDown = false
    private var lastMoveX = 0f
    private var downX = 0f

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          cursorMode = false
          downX = event.rawX
          lastMoveX = event.rawX
          applyPressedState(v, true)
          commitSpace()
          committedOnDown = true
          playKeySound()
          pulse()
          longPressRunnable =
            Runnable {
              cursorMode = true
              applyPressedState(v, false)
              pulse()
              lastMoveX = downX
              if (committedOnDown) deleteOneCharacterTracked()
              committedOnDown = false
              showCursorOverlay()
            }.also {
              mainHandler.postDelayed(it, longPressDurationMs)
            }
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          if (!cursorMode) return true
          val stepWidth = dp(8).toFloat()
          val deltaX = event.rawX - lastMoveX
          val stepCount = (deltaX / stepWidth).toInt()
          if (stepCount != 0) {
            moveCursorBy(stepCount)
            lastMoveX += stepCount * stepWidth
          }
          return true
        }

        MotionEvent.ACTION_UP -> {
          cancelLongPress()
          applyPressedState(v, false)
          dismissCursorOverlay()
          cursorMode = false
          committedOnDown = false
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          cancelLongPress()
          applyPressedState(v, false)
          dismissCursorOverlay()
          cursorMode = false
          committedOnDown = false
          return true
        }
      }
      return true
    }

    private fun commitSpace() {
      if (pickerSearchActive) {
        updatePickerSearchQuery(" ")
        return
      }
      if (!commitPeriodForDoubleSpace()) {
        commitTrackedText(" ", countAsTyping = true, countsCompletedWord = true)
      }
      refreshAutoCaps()
      applyActionResult(actionEngine.spaceLeavesSymbols())
    }

    private fun cancelLongPress() {
      longPressRunnable?.let(mainHandler::removeCallbacks)
      longPressRunnable = null
    }
  }

  private fun moveCursorBy(steps: Int) {
    val input = inputSupplier() ?: return
    val extracted = input.getExtractedText(ExtractedTextRequest(), 0)
    if (extracted != null) {
      val text = extracted.text?.toString().orEmpty()
      val anchor =
        if (steps >= 0) {
          maxOf(extracted.selectionStart, extracted.selectionEnd)
        } else {
          minOf(extracted.selectionStart, extracted.selectionEnd)
        }
      val next = extracted.startOffset + GraphemeText.offsetByClusters(text, anchor, steps)
      input.setSelection(next, next)
      return
    }
    val keyCode = if (steps > 0) KeyEvent.KEYCODE_DPAD_RIGHT else KeyEvent.KEYCODE_DPAD_LEFT
    repeat(kotlin.math.abs(steps)) {
      input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
      input.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
    }
  }

  private fun showCursorOverlay() {
    val existing = cursorOverlayPopup
    if (existing != null) {
      existing.label.text = "Swipe left or right to move cursor"
      return
    }

    post {
      val topAreaHeight = getChildAt(0)?.height ?: 0
      val surface = color("surface", "#121214")
      val dimColor =
        Color.argb(
          230,
          Color.red(surface),
          Color.green(surface),
          Color.blue(surface),
        )
      val label =
        TextView(context).apply {
          text = "Swipe left or right to move cursor"
          setTextColor(Color.WHITE)
          textSize = (fontSize + 1f).coerceAtLeast(13f)
          typeface = keyTypeface
          gravity = Gravity.CENTER
        }

      val dimmer =
        View(context).apply {
          setBackgroundColor(dimColor)
        }

      val overlay =
        FrameLayout(context).apply {
          setBackgroundColor(Color.TRANSPARENT)
          addView(
            dimmer,
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply {
              topMargin = topAreaHeight
            },
          )
          addView(
            label,
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.WRAP_CONTENT,
              FrameLayout.LayoutParams.WRAP_CONTENT,
              Gravity.CENTER,
            ).apply {
              topMargin = topAreaHeight
            },
          )
        }

      val popup =
        PopupWindow(
          overlay,
          width.coerceAtLeast(1),
          height.coerceAtLeast(1),
          false,
        ).apply {
          isTouchable = false
          isOutsideTouchable = false
          elevation = dp(12).toFloat()
          setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
          setOnDismissListener {
            if (cursorOverlayPopup?.popup === this) {
              cursorOverlayPopup = null
            }
          }
        }

      cursorOverlayPopup = CursorOverlaySession(popup = popup, label = label)

      if (!popup.isShowing) {
        val location = IntArray(2)
        getLocationOnScreen(location)
        popup.showAtLocation(this, Gravity.NO_GRAVITY, location[0], location[1])
      }
    }
  }

  private fun dismissCursorOverlay() {
    cursorOverlayPopup?.popup?.dismiss()
    cursorOverlayPopup = null
  }

  private inner class TapTouch(
    private val ignoreWhen: (() -> Boolean)? = null,
    private val allowParentScroll: Boolean = false,
    private val onTap: (View) -> Unit,
  ) : OnTouchListener {
    private var downX = 0f
    private var downY = 0f
    private var movedBeyondSlop = false

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      if (allowParentScroll) {
        return handleScrollFriendlyTouch(v, event)
      }

      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          if (ignoreWhen?.invoke() == true) return true
          applyPressedState(v, true)
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          applyPressedState(v, isWithinTouchBounds(v, event))
          return true
        }

        MotionEvent.ACTION_UP -> {
          applyPressedState(v, false)
          if (ignoreWhen?.invoke() == true) return true
          if (!isWithinTouchBounds(v, event)) return true
          onTap(v)
          pulse()
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          applyPressedState(v, false)
          return true
        }
      }
      return true
    }

    private fun handleScrollFriendlyTouch(v: View, event: MotionEvent): Boolean {
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          if (ignoreWhen?.invoke() == true) return false
          downX = event.x
          downY = event.y
          movedBeyondSlop = false
          applyPressedState(v, true)
          v.parent?.requestDisallowInterceptTouchEvent(false)
          return true
        }

        MotionEvent.ACTION_MOVE -> {
          if (movedBeyondSlop) return false
          val dx = event.x - downX
          val dy = event.y - downY
          if (dx * dx + dy * dy > touchSlopPx * touchSlopPx) {
            movedBeyondSlop = true
            applyPressedState(v, false)
            v.parent?.requestDisallowInterceptTouchEvent(false)
            return false
          }
          applyPressedState(v, isWithinTouchBounds(v, event))
          return true
        }

        MotionEvent.ACTION_UP -> {
          applyPressedState(v, false)
          if (!movedBeyondSlop && ignoreWhen?.invoke() != true && isWithinTouchBounds(v, event)) {
            onTap(v)
            pulse()
          }
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          applyPressedState(v, false)
          movedBeyondSlop = false
          return true
        }
      }
      return true
    }
  }

  private inner class DeleteKeyTouch : OnTouchListener {
    private var repeatRunnable: Runnable? = null

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          stopDeleteRepeat()
          applyPressedState(v, true)
          deleteOnce()
          playKeySound()
          pulse()
          repeatRunnable =
            object : Runnable {
              override fun run() {
                deleteOnce()
                mainHandler.postDelayed(this, 50L)
              }
            }.also {
              mainHandler.postDelayed(it, ViewConfiguration.getLongPressTimeout().toLong())
            }
        }

        MotionEvent.ACTION_MOVE -> {
          val stillInside = isWithinTouchBounds(v, event)
          applyPressedState(v, stillInside)
          if (!stillInside) stopDeleteRepeat()
          return true
        }

        MotionEvent.ACTION_UP -> {
          applyPressedState(v, false)
          stopDeleteRepeat()
          return true
        }

        MotionEvent.ACTION_CANCEL -> {
          applyPressedState(v, false)
          stopDeleteRepeat()
          return true
        }
      }

      return true
    }

    private fun deleteOnce() {
      if (pickerSearchActive) {
        deletePickerSearchCharacter()
        return
      }
      discardTranslationUndo()
      deleteOneCharacterTracked()
      refreshAutoCaps()
    }

    private fun stopDeleteRepeat() {
      repeatRunnable?.let(mainHandler::removeCallbacks)
      repeatRunnable = null
    }
  }

  private fun applyPressedState(v: View, pressed: Boolean) {
    if (v.background is StateListDrawable) {
      if (v.isPressed != pressed) v.isPressed = pressed
      return
    }
    val targetAlpha = if (pressed) 0.82f else 1f
    if (v.alpha != targetAlpha) {
      v.alpha = targetAlpha
    }
  }

  private fun isWithinTouchBounds(v: View, event: MotionEvent): Boolean =
    event.x >= -touchSlopPx &&
      event.y >= -touchSlopPx &&
      event.x < v.width + touchSlopPx &&
      event.y < v.height + touchSlopPx

  private fun keyViewAt(rawX: Float, rawY: Float): View? {
    val root = boardRootView ?: return null
    root.getLocationOnScreen(touchLocationBuffer)
    return keyViewAtLocal(rawX - touchLocationBuffer[0], rawY - touchLocationBuffer[1])
  }

  private fun keyViewAtLocal(x: Float, y: Float): View? {
    val root = boardRootView ?: return null
    for (rowIndex in 0 until root.childCount) {
      val row = root.getChildAt(rowIndex) as? ViewGroup ?: continue
      if (y < row.top || y >= row.bottom) continue
      var nearest: View? = null
      var nearestGap = Float.MAX_VALUE
      for (keyIndex in 0 until row.childCount) {
        val key = row.getChildAt(keyIndex)
        if (key !in boardKeyViews) continue
        val left = (row.left + key.left).toFloat()
        val right = (row.left + key.right).toFloat()
        if (x >= left && x < right) return key
        val gap = if (x < left) left - x else x - right
        if (gap < nearestGap) {
          nearestGap = gap
          nearest = key
        }
      }
      return nearest
    }
    return null
  }

  private fun isWithinKeyBounds(v: View, event: MotionEvent): Boolean {
    val at = keyViewAt(event.rawX, event.rawY)
    return at === v || (at != null && tapRedirects[v] === at)
  }

  private fun toolbarIcon(
    iconRes: Int,
    contentDescriptionText: String,
    bg: Int,
    tint: Int? = null,
    iconSizeDp: Int = 12,
    onClick: () -> Unit,
  ): FrameLayout =
    FrameLayout(context).apply {
      contentDescription = contentDescriptionText
      background = roundedBg(bg, 999f)
      layoutParams =
        LayoutParams(dp(30), dp(30)).apply {
          marginEnd = dp(6)
        }
      isClickable = true
      isFocusable = true
      addView(
        ImageView(context).apply {
          setImageResource(iconRes)
          if (tint == null) clearColorFilter() else setColorFilter(tint)
          scaleType = ImageView.ScaleType.FIT_CENTER
          isClickable = false
          isFocusable = false
          layoutParams = FrameLayout.LayoutParams(dp(iconSizeDp), dp(iconSizeDp), Gravity.CENTER)
        },
      )
      setOnTouchListener(TapTouch { onClick() })
    }

  private fun modeToggleIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_mode_translate,
      contentDescriptionText = "Translate mode",
      bg = if (featureMode == FeatureMode.TRANSLATE) activeTint else bg,
      tint = null,
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.TRANSLATE)
    }.apply {
      setPadding(dp(5), dp(5), dp(5), dp(5))
    }

  private fun dictionaryModeIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.hypa_dictionary,
      contentDescriptionText = "Dictionary mode",
      bg = if (featureMode == FeatureMode.DICTIONARY) activeTint else bg,
      tint = null,
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.DICTIONARY)
    }

  private fun toolsPanelToggleIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_keyboard_more,
      contentDescriptionText = if (isToolsPanelOpen) "Close tools" else "More tools",
      bg = if (isToolsPanelOpen) activeTint else bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 16,
    ) {
      isToolsPanelOpen = !isToolsPanelOpen
      rebuild()
    }

  private fun clipboardIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_keyboard_clipboard,
      contentDescriptionText = "Clipboard",
      bg = if (featureMode == FeatureMode.CLIPBOARD) activeTint else bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.CLIPBOARD)
    }

  private fun textEditingIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_keyboard_text_editing,
      contentDescriptionText = "Text editing",
      bg = if (featureMode == FeatureMode.TEXT_EDITING) activeTint else bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 18,
    ) {
      activateTool(KeyboardTool.TEXT_EDITING)
    }

  private fun languagesIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_hypa_logo_mark,
      contentDescriptionText = "Languages",
      bg = if (featureMode == FeatureMode.KEYBOARD_LANGUAGE_PICKER) activeTint else bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.LANGUAGES)
    }

  private fun emojiIcon(bg: Int, activeTint: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_emoji_smileys,
      contentDescriptionText = "Emoji",
      bg = if (featureMode == FeatureMode.EMOJI) activeTint else bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.EMOJI)
    }

  private fun settingsIcon(bg: Int): FrameLayout =
    toolbarIcon(
      iconRes = R.drawable.ic_audio_settings,
      contentDescriptionText = "Settings",
      bg = bg,
      tint = color("label", "#EAEAEE"),
      iconSizeDp = 16,
    ) {
      activateTool(KeyboardTool.SETTINGS)
    }

  private fun buildToolsPanel(): LinearLayout {
    val grid =
      LinearLayout(context).apply {
        orientation = VERTICAL
        clipChildren = false
        clipToPadding = false
        setPadding(dp(TOOL_LABEL_BLEED_DP - 6), 0, dp(TOOL_LABEL_BLEED_DP - 6), 0)
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      }
    renderToolsPanelTiles(grid)
    grid.setOnTouchListener(ToolsReorderTouch(grid))

    val label = color("label", "#EAEAEE")
    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(color("surface", "#121214"))
      setPadding(dp(6), 0, dp(6), dp(8))
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      addView(
        View(context).apply {
          setBackgroundColor(Color.argb(31, Color.red(label), Color.green(label), Color.blue(label)))
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, dp(1)).apply { bottomMargin = dp(13) }
        },
      )
      addView(
        ScrollView(context).apply {
          isFillViewport = true
          isVerticalScrollBarEnabled = true
          layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          grid.layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
          addView(grid)
        },
      )
    }
  }

  private fun renderToolsPanelTiles(grid: LinearLayout) {
    grid.removeAllViews()
    toolOrder.chunked(TOOLBAR_TOOL_COUNT).forEach { tools ->
      grid.addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.TOP
          clipChildren = false
          clipToPadding = false
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(12)
            }
          repeat(TOOLBAR_TOOL_COUNT) { column ->
            if (column > 0) {
              addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
            }
            addView(
              tools.getOrNull(column)?.let(::toolsPanelTile)
                ?: View(context).apply { layoutParams = LayoutParams(dp(TOOL_TILE_DP), 0) },
            )
          }
        },
      )
    }
  }

  private fun refreshToolsPanelInPlace(grid: LinearLayout) {
    renderToolsPanelTiles(grid)
    renderedContentSignature = currentContentSignature()
    renderTopArea()
    renderedTopAreaSignature = currentTopAreaSignature()
  }

  private fun toolsPanelTile(tool: KeyboardTool): LinearLayout {
    val labelColor = color("label", "#EAEAEE")
    val keyBg = color("key", "#2C2C31")
    val accent = color("accent", "#3B82F6")
    val labelText = toolLabel(tool)

    return LinearLayout(context).apply {
      orientation = VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      clipChildren = false
      clipToPadding = false
      layoutParams = LayoutParams(dp(TOOL_TILE_DP), LayoutParams.WRAP_CONTENT)
      contentDescription = labelText
      alpha = if (tool == draggingTool) 0.4f else 1f
      addView(
        FrameLayout(context).apply {
          background = roundedBg(if (isToolActive(tool)) accent else keyBg, 999f)
          layoutParams = LayoutParams(dp(TOOL_TILE_DP), dp(TOOL_TILE_DP))
          addView(
            ImageView(context).apply {
              setImageResource(toolIconRes(tool))
              when (tool) {
                KeyboardTool.TRANSLATE, KeyboardTool.DICTIONARY -> clearColorFilter()
                else -> setColorFilter(if (isToolActive(tool)) Color.WHITE else labelColor)
              }
              scaleType = ImageView.ScaleType.FIT_CENTER
              layoutParams = FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER)
            },
          )
        },
      )
      addView(
        TextView(context).apply {
          text = labelText
          setTextColor(labelColor)
          textSize = (fontSize - 3f).coerceAtLeast(10f)
          typeface = keyTypeface
          gravity = Gravity.CENTER
          maxLines = 1
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(6)
              leftMargin = -dp(TOOL_LABEL_BLEED_DP)
              rightMargin = -dp(TOOL_LABEL_BLEED_DP)
            }
        },
      )
    }
  }

  private fun toolIconRes(tool: KeyboardTool): Int =
    when (tool) {
      KeyboardTool.TRANSLATE -> R.drawable.ic_mode_translate
      KeyboardTool.VOICE -> R.drawable.ic_audio_mic
      KeyboardTool.SPEAK -> R.drawable.ic_mode_audio
      KeyboardTool.DICTIONARY -> R.drawable.hypa_dictionary
      KeyboardTool.CLIPBOARD -> R.drawable.ic_keyboard_clipboard
      KeyboardTool.TEXT_EDITING -> R.drawable.ic_keyboard_text_editing
      KeyboardTool.LANGUAGES -> R.drawable.ic_hypa_logo_mark
      KeyboardTool.EMOJI -> R.drawable.ic_emoji_smileys
      KeyboardTool.SETTINGS -> R.drawable.ic_audio_settings
    }

  private fun toolLabel(tool: KeyboardTool): String =
    when (tool) {
      KeyboardTool.TRANSLATE -> "Translate"
      KeyboardTool.VOICE -> "Transcribe"
      KeyboardTool.SPEAK -> "Speak"
      KeyboardTool.DICTIONARY -> "Dictionary"
      KeyboardTool.CLIPBOARD -> "Clipboard"
      KeyboardTool.TEXT_EDITING -> "Editing"
      KeyboardTool.LANGUAGES -> "Languages"
      KeyboardTool.EMOJI -> "Emoji"
      KeyboardTool.SETTINGS -> "Settings"
    }

  private fun isToolActive(tool: KeyboardTool): Boolean =
    when (tool) {
      KeyboardTool.TRANSLATE -> featureMode == FeatureMode.TRANSLATE
      KeyboardTool.VOICE -> isSttListening
      KeyboardTool.SPEAK -> hasActiveTtsState()
      KeyboardTool.DICTIONARY -> featureMode == FeatureMode.DICTIONARY
      KeyboardTool.CLIPBOARD -> featureMode == FeatureMode.CLIPBOARD
      KeyboardTool.TEXT_EDITING -> featureMode == FeatureMode.TEXT_EDITING
      KeyboardTool.LANGUAGES -> featureMode == FeatureMode.KEYBOARD_LANGUAGE_PICKER
      KeyboardTool.EMOJI -> featureMode == FeatureMode.EMOJI
      KeyboardTool.SETTINGS -> false
    }

  private fun activateTool(tool: KeyboardTool) {
    isToolsPanelOpen = false
    when (tool) {
      KeyboardTool.TRANSLATE ->
        featureMode =
          if (featureMode == FeatureMode.TRANSLATE) FeatureMode.KEYBOARD else FeatureMode.TRANSLATE
      KeyboardTool.VOICE -> isAudioMenuOpen = true
      KeyboardTool.SPEAK -> openTtsModeFromToolbar()
      KeyboardTool.DICTIONARY -> {
        featureMode =
          if (featureMode == FeatureMode.DICTIONARY) FeatureMode.KEYBOARD else FeatureMode.DICTIONARY
        latestDictionaryResult = null
      }
      KeyboardTool.CLIPBOARD -> openClipboard()
      KeyboardTool.TEXT_EDITING -> openTextEditing()
      KeyboardTool.LANGUAGES ->
        featureMode =
          if (featureMode == FeatureMode.KEYBOARD_LANGUAGE_PICKER) {
            FeatureMode.KEYBOARD
          } else {
            FeatureMode.KEYBOARD_LANGUAGE_PICKER
          }
      KeyboardTool.EMOJI ->
        if (featureMode == FeatureMode.EMOJI) featureMode = FeatureMode.KEYBOARD else openEmojiPanel()
      KeyboardTool.SETTINGS -> openHostAppSettings()
    }
    rebuild()
  }

  private fun openClipboard() {
    HypaKeyboardClipStore.optIn(context)
    HypaKeyboardClipStore.captureCurrentClip(context)
    isClipboardEditMode = false
    featureMode = if (featureMode == FeatureMode.CLIPBOARD) FeatureMode.KEYBOARD else FeatureMode.CLIPBOARD
  }

  private fun openTextEditing() {
    isTextEditingSelectMode = false
    textEditingAnchor = -1
    featureMode = if (featureMode == FeatureMode.TEXT_EDITING) FeatureMode.KEYBOARD else FeatureMode.TEXT_EDITING
  }

  private fun pasteClip(text: String) {
    HypaKeyboardClipStore.setCurrentClip(context, text)
    commitTrackedText(text)
    refreshAutoCaps()
  }

  private fun buildClipboardBoard(): View {
    val clips = HypaKeyboardClipStore.clips(context)
    val pinned = clips.filter { it.pinned }
    val recent = clips.filterNot { it.pinned }

    return ScrollView(context).apply {
      isVerticalScrollBarEnabled = false
      setBackgroundColor(color("surface", "#121214"))
      isFillViewport = true
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      addView(
        LinearLayout(context).apply {
          orientation = VERTICAL
          setPadding(dp(8), dp(8), dp(8), dp(10))

          if (clips.isEmpty()) {
            addView(clipboardTips())
            return@apply
          }
          if (pinned.isNotEmpty()) {
            addView(clipSectionLabel("Pinned"))
            clipRows(pinned).forEach { addView(it) }
          }
          if (recent.isNotEmpty()) {
            addView(clipSectionLabel("Recent"))
            clipRows(recent).forEach { addView(it) }
          }
        },
      )
    }
  }



  private fun clipRows(clips: List<KeyboardClip>): List<LinearLayout> =
    clips.chunked(2).map { row ->
      LinearLayout(context).apply {
        orientation = HORIZONTAL
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
        row.forEach { addView(clipCard(it)) }
        if (row.size == 1) addView(View(context).apply { layoutParams = LayoutParams(0, 0, 1f) })
      }
    }

  private fun clipCard(clip: KeyboardClip): FrameLayout {
    val labelColor = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val hasBadge = isClipboardEditMode || clip.pinned

    return FrameLayout(context).apply {
      background = roundedBg(color("key", "#2C2C31"), 12f)
      contentDescription = clip.text
      layoutParams =
        LayoutParams(0, dp(74), 1f).apply {
          marginEnd = dp(6)
          bottomMargin = dp(6)
        }
      setPadding(dp(10), dp(8), dp(8), dp(8))
      isClickable = true
      isFocusable = true

      addView(
        TextView(context).apply {
          text = clip.text
          setTextColor(labelColor)
          textSize = (fontSize - 2f).coerceAtLeast(11f)
          typeface = keyTypeface
          maxLines = 3
          ellipsize = android.text.TextUtils.TruncateAt.END
          layoutParams =
            FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply { if (hasBadge) marginEnd = dp(22) }
        },
      )

      if (isClipboardEditMode) {
        addView(
          clipBadge(R.drawable.ic_audio_close, "Delete clip", labelColor) {
            HypaKeyboardClipStore.delete(context, clip.text)
            rebuild()
          },
        )
      } else if (clip.pinned) {
        addView(clipBadge(R.drawable.ic_keyboard_pin, "Pinned", accent, onClick = null))
      }

      setOnClickListener {
        pulse()
        pasteClip(clip.text)
      }
      setOnLongClickListener {
        pulse()
        if (HypaKeyboardClipStore.setPinned(context, clip.text, !clip.pinned)) {
          clearToolbarError(ToolbarErrorSlot.CLIPBOARD)
          rebuild()
        } else {
          showToolbarError(ToolbarErrorSlot.CLIPBOARD, KeyboardErrorCatalog.pinLimitReached)
        }
        true
      }
    }
  }

  private fun clipBadge(iconRes: Int, description: String, tint: Int, onClick: (() -> Unit)?): FrameLayout =
    FrameLayout(context).apply {
      contentDescription = description
      layoutParams = FrameLayout.LayoutParams(dp(22), dp(22), Gravity.TOP or Gravity.END)
      addView(
        ImageView(context).apply {
          setImageResource(iconRes)
          setColorFilter(tint)
          scaleType = ImageView.ScaleType.FIT_CENTER
          layoutParams = FrameLayout.LayoutParams(dp(13), dp(13), Gravity.CENTER)
        },
      )
      if (onClick != null) {
        background = roundedBg(color("surface", "#121214"), 999f)
        isClickable = true
        setOnTouchListener(TapTouch { onClick() })
      }
    }

  private fun clipSectionLabel(text: String): TextView =
    TextView(context).apply {
      this.text = text
      setTextColor(color("label", "#EAEAEE"))
      alpha = 0.6f
      textSize = (fontSize - 4f).coerceAtLeast(10f)
      typeface = keyTypeface
      maxLines = 1
      layoutParams =
        LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
          bottomMargin = dp(6)
        }
    }

  private fun clipboardTips(): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      addView(clipSectionLabel("Tips"))
      listOf(
        "Text you copy shows up here.",
        "Tap a clip to paste it.",
        "Touch and hold a clip to pin it. Unpinned clips are deleted after an hour.",
        "Use the edit icon to delete clips.",
      ).forEach { tip ->
        addView(
          TextView(context).apply {
            text = tip
            setTextColor(color("label", "#EAEAEE"))
            textSize = (fontSize - 3f).coerceAtLeast(10f)
            typeface = keyTypeface
            background = roundedBg(color("key", "#2C2C31"), 12f)
            setPadding(dp(10), dp(9), dp(10), dp(9))
            layoutParams =
              LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
              }
          },
        )
      }
    }

  private inner class ToolsReorderTouch(private val grid: LinearLayout) : OnTouchListener {
    private var downIndex = -1
    private var downX = 0f
    private var downY = 0f
    private var reordered = false
    private var pickUp: Runnable? = null

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downIndex = slotAt(event.x, event.y)
          downX = event.x
          downY = event.y
          if (downIndex >= 0) schedulePickUp()
        }

        MotionEvent.ACTION_MOVE -> {
          if (draggingTool == null) {
            if (movedBeyondSlop(event)) {
              cancelPickUp()
              downIndex = -1
            }
          } else {
            moveDraggedTo(slotAt(event.x, event.y))
          }
        }

        MotionEvent.ACTION_UP -> {
          cancelPickUp()
          if (draggingTool != null) {
            drop()
          } else {
            toolOrder.getOrNull(downIndex)?.let { tool ->
              tileAt(downIndex)?.let { pulse() }
              activateTool(tool)
            }
          }
          downIndex = -1
        }

        MotionEvent.ACTION_CANCEL -> {
          cancelPickUp()
          downIndex = -1
          if (draggingTool != null) drop()
        }
      }
      return true
    }

    private fun schedulePickUp() {
      val runnable =
        Runnable {
          draggingTool = toolOrder.getOrNull(downIndex) ?: return@Runnable
          grid.parent?.requestDisallowInterceptTouchEvent(true)
          tileAt(downIndex)?.let { pulse() }
          refreshToolsPanelInPlace(grid)
        }
      pickUp = runnable
      mainHandler.postDelayed(runnable, longPressDurationMs)
    }

    private fun cancelPickUp() {
      pickUp?.let { mainHandler.removeCallbacks(it) }
      pickUp = null
    }

    private fun moveDraggedTo(slot: Int) {
      val from = toolOrder.indexOf(draggingTool ?: return)
      if (slot < 0 || from < 0 || slot == from) return
      toolOrder = toolOrder.toMutableList().apply { add(slot, removeAt(from)) }
      reordered = true
      refreshToolsPanelInPlace(grid)
    }

    private fun drop() {
      grid.parent?.requestDisallowInterceptTouchEvent(false)
      draggingTool = null
      if (reordered) {
        reordered = false
        persistToolOrder()
      }
      refreshToolsPanelInPlace(grid)
    }

    private fun movedBeyondSlop(event: MotionEvent): Boolean {
      val dx = event.x - downX
      val dy = event.y - downY
      return dx * dx + dy * dy > touchSlopPx * touchSlopPx
    }

    private fun slotAt(x: Float, y: Float): Int {
      if (grid.childCount == 0 || grid.width <= 0) return -1
      val rowIndex =
        (0 until grid.childCount).firstOrNull { y < grid.getChildAt(it).bottom }
          ?: (grid.childCount - 1)
      val columnWidth = grid.width.toFloat() / TOOLBAR_TOOL_COUNT
      val column = (x / columnWidth).toInt().coerceIn(0, TOOLBAR_TOOL_COUNT - 1)
      return (rowIndex * TOOLBAR_TOOL_COUNT + column).coerceAtMost(toolOrder.lastIndex)
    }

    private fun tileAt(index: Int): View? {
      if (index < 0) return null
      val row = grid.getChildAt(index / TOOLBAR_TOOL_COUNT) as? LinearLayout ?: return null
      return row.getChildAt((index % TOOLBAR_TOOL_COUNT) * 2)
    }
  }

  private fun languageForCode(code: String): TranslationLanguage =
    supportedLanguages().firstOrNull { it.code.equals(KeyboardLanguageCatalog.canonicalCode(code), ignoreCase = true) }
      ?: preferredLanguage(supportedLanguages())
      ?: KeyboardLanguageCatalog.defaultSourceLanguage

  private fun keyboardLanguageForCode(code: String): TranslationLanguage {
    val normalized = KeyboardLanguageCatalog.canonicalCode(code)
    val layoutLanguages =
      keyboardLanguageOptions().filter { KeyboardLanguageCatalog.hasCustomLayout(it.code) }
    return layoutLanguages.firstOrNull { it.code.equals(normalized, ignoreCase = true) }
      ?: preferredLanguage(layoutLanguages)
      ?: KeyboardLanguageCatalog.defaultSourceLanguage
  }

  private fun keyboardSpaceLabel(): String {
    val languageLabel =
      when (keyboardLanguageCode.trim().lowercase()) {
        "auto", "", "en", "en-us" -> "English"
        else -> keyboardLanguageForCode(keyboardLanguageCode).name
      }
    return "Hypa $languageLabel"
  }

  private fun setKeyboardLanguage(code: String) {
    if (!KeyboardLanguageCatalog.hasCustomLayout(code)) return
    val language = keyboardLanguageForCode(code)
    keyboardLanguageCode = language.code
    contextEngine.setLanguage(language.code)
    corpusStore.setLanguage(language.code)

    runCatching {
      val settings = runCatching { JSONObject(themeJson) }.getOrElse { JSONObject(HypaKeyboardStore.defaultSettingsJson()) }
      settings.put("languageId", language.code)
      val updated = settings.toString()
      themeJson = updated
      HypaKeyboardStore.setSettingsJson(context, updated)
    }.onFailure {
      Log.w(TAG, "Failed to persist keyboard language", it)
    }

    rebuild()
  }

  private fun showSystemInputMethodPicker() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
    runCatching { imm.showInputMethodPicker() }
      .onFailure { Log.w(TAG, "Input method picker unavailable", it) }
  }

  private fun buildLanguagePicker(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#A1A1AA")

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Change Language"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.TRANSLATE
            rebuild()
          })
        },
      )

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.TOP
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)

          addView(buildLanguageColumn(true, keyBg, label, muted), LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              gravity = Gravity.CENTER_HORIZONTAL or Gravity.TOP
              layoutParams = LayoutParams(dp(48), LayoutParams.MATCH_PARENT)
              addView(
                translateIconChip(toolbar, accent, enabled = canSwapTranslateLanguages()) {
                  if (!canSwapTranslateLanguages()) return@translateIconChip
                  swapTranslateLanguages(rebuildUi = false)
                  featureMode = FeatureMode.LANGUAGE_PICKER
                  refreshOpenPickerSelections()
                }.apply {
                  tag = "picker:translate-swap"
                  layoutParams = LayoutParams(dp(36), dp(36))
                  (layoutParams as LayoutParams).topMargin = dp(28)
                },
              )
            },
          )
          addView(buildLanguageColumn(false, keyBg, label, muted), LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
        },
      )

      addView(
        TextView(context).apply {
          text = "Done"
          setTextColor(Color.WHITE)
          textSize = fontSize
          typeface = keyTypeface
          gravity = Gravity.CENTER
          minHeight = dp(38)
          background = roundedBg(accent, 999f)
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(8)
            }
          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.TRANSLATE
            rebuild()
          })
        },
      )
    }
  }

  private fun pickerSearchButton(scope: PickerSearchScope, fg: Int): TextView =
    TextView(context).apply {
      text = "⌕"
      setTextColor(fg)
      textSize = fontSize + 4f
      gravity = Gravity.CENTER
      background = roundedBg(color("toolbar", "#18181B"), 999f)
      layoutParams = LayoutParams(dp(36), dp(36))
      contentDescription = "Search"
      setOnTouchListener(TapTouch { beginPickerSearch(scope, when (scope) {
        PickerSearchScope.TRANSLATE_SOURCE, PickerSearchScope.TRANSLATE_TARGET -> FeatureMode.LANGUAGE_PICKER
        PickerSearchScope.TTS_LANGUAGE, PickerSearchScope.TTS_VOICE -> FeatureMode.TTS_LANGUAGE_PICKER
        PickerSearchScope.STT_LANGUAGE -> FeatureMode.STT_LANGUAGE_PICKER
        PickerSearchScope.DICTIONARY_LANGUAGE -> FeatureMode.DICTIONARY_LANGUAGE_PICKER
        PickerSearchScope.EMOJI -> FeatureMode.EMOJI
      }) })
    }

  private fun buildLanguageColumn(
    isSourceColumn: Boolean,
    bg: Int,
    fg: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      
      addView(
        buildPickerSectionHeader(
          title = if (isSourceColumn) "Source" else "Target",
          scope = if (isSourceColumn) PickerSearchScope.TRANSLATE_SOURCE else PickerSearchScope.TRANSLATE_TARGET,
          bg = bg
        )
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          isFillViewport = true
          bindPickerScroll(
            this,
            if (isSourceColumn) "translate-source" else "translate-target",
            if (isSourceColumn) "picker-option:translate-source:" else "picker-option:translate-target:",
            if (isSourceColumn) sourceLanguageCode else targetLanguageCode
          )
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              setPadding(dp(2), 0, dp(2), 0)

              val options = if (isSourceColumn) supportedSourceLanguages() else supportedTargetLanguages()
              options.forEach { language ->
                addView(languageOption(language, isSourceColumn, bg, fg))
              }
            },
          )
        },
      )
    }

  private fun languageOption(
    language: TranslationLanguage,
    isSourceColumn: Boolean,
    bg: Int,
    fg: Int,
  ): TextView =
    TextView(context).apply {
      text = language.name
      tag = "picker-option:translate-${if (isSourceColumn) "source" else "target"}:${language.code}"
      textSize = (fontSize - 1f).coerceAtLeast(11f)
      typeface = keyTypeface
      gravity = Gravity.CENTER_VERTICAL
      minHeight = dp(34)
      setPadding(dp(10), dp(7), dp(10), dp(7))
      layoutParams =
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
          bottomMargin = dp(5)
        }
      applyTranslateLanguageOptionState(
        this,
        language.code,
        isSourceColumn,
        fg,
        bg,
        color("toolbar", "#18181B"),
        Color.parseColor("#71717A"),
      )
    }

  private fun buildThinkingView(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val thinking = latestTranslationThinking?.trim().orEmpty()

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Translation Thinking"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.TRANSLATE
            rebuild()
          })
        },
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          addView(
            FrameLayout(context).apply {
              background = roundedBg(keyBg, 16f)
              val body = TextView(context).apply {
                text =
                  when {
                    isTranslationThinkingLoading -> "Generating translation breakdown…"
                    thinking.isNotBlank() -> thinking
                    else -> "No thinking trace was returned for the last translation."
                  }
                setTextColor(label)
                textSize = (fontSize - 1f).coerceAtLeast(11f)
                typeface = keyTypeface
                setPadding(dp(14), dp(12), dp(54), dp(12))
                layoutParams = FrameLayout.LayoutParams(
                  FrameLayout.LayoutParams.MATCH_PARENT,
                  FrameLayout.LayoutParams.WRAP_CONTENT,
                )
              }
              addView(body)
              addView(
                dictionarySpeechButton(
                  identifier = "translation-thinking",
                  iconRes = activeDictionaryIconRes("translation-thinking"),
                  backgroundColor = accent,
                  tint = label,
                  sizeDp = 32,
                ) {
                  speakDictionaryText(thinking, targetLanguageName, "translation-thinking")
                },
                FrameLayout.LayoutParams(dp(32), dp(32), Gravity.END or Gravity.CENTER_VERTICAL).apply {
                  marginEnd = dp(10)
                },
              )
              layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
            },
          )
        },
      )
    }
  }

  private fun buildKeyboardLanguagePicker(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val muted = Color.parseColor("#71717A")

    val available = keyboardLanguageOptions().filter { KeyboardLanguageCatalog.hasCustomLayout(it.code) }
    val selectedCode = keyboardLanguageForCode(keyboardLanguageCode).code

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Keyboard Language"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.KEYBOARD
            rebuild()
          })
        },
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          bindPickerScroll(this, "keyboard-language", "picker-option:keyboard-language:", selectedCode)
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              setPadding(dp(2), 0, dp(2), 0)

              addView(
                TextView(context).apply {
                  text = "Switch keyboard"
                  setTextColor(label)
                  textSize = (fontSize - 1f).coerceAtLeast(11f)
                  typeface = keyTypeface
                  gravity = Gravity.CENTER_VERTICAL
                  minHeight = dp(34)
                  background = roundedBg(keyBg, 12f)
                  setPadding(dp(10), dp(7), dp(10), dp(7))
                  layoutParams =
                    LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                      bottomMargin = dp(10)
                    }
                  setOnTouchListener(TapTouch(allowParentScroll = true) {
                    featureMode = FeatureMode.KEYBOARD
                    rebuild()
                    showSystemInputMethodPicker()
                  })
                },
              )

              addView(
                TextView(context).apply {
                  text = "Language"
                  setTextColor(muted)
                  textSize = (fontSize - 2f).coerceAtLeast(10f)
                  typeface = keyTypeface
                  layoutParams =
                    LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                      bottomMargin = dp(5)
                    }
                },
              )

              available.forEach { language ->
                addView(
                  TextView(context).apply {
                    val selected = language.code.equals(selectedCode, ignoreCase = true)
                    text = language.name
                    tag = "picker-option:keyboard-language:${language.code}"
                    setTextColor(
                      if (selected) color("pillLabel", "#111111") else label,
                    )
                    textSize = (fontSize - 1f).coerceAtLeast(11f)
                    typeface = keyTypeface
                    gravity = Gravity.CENTER_VERTICAL
                    minHeight = dp(34)
                    background =
                      roundedBg(if (selected) color("pill", "#FFFFFF") else keyBg, 12f)
                    setPadding(dp(10), dp(7), dp(10), dp(7))
                    layoutParams =
                      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(5)
                      }
                    setOnTouchListener(TapTouch(allowParentScroll = true) {
                      featureMode = FeatureMode.KEYBOARD
                      setKeyboardLanguage(language.code)
                    })
                  },
                )
              }

              if (available.size < keyboardLanguageOptions().size) {
                addView(
                  TextView(context).apply {
                    text = "More languages coming soon"
                    setTextColor(muted)
                    textSize = (fontSize - 3f).coerceAtLeast(10f)
                    typeface = keyTypeface
                    gravity = Gravity.CENTER
                    minHeight = dp(28)
                  },
                )
              }
            },
          )
        },
      )
    }
  }

  private fun buildDictionaryLanguagePicker(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val muted = Color.parseColor("#71717A")

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Dictionary Language"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.DICTIONARY
            rebuild()
          })
        },
      )

      addView(
        buildPickerSectionHeader(
          title = "Search in",
          scope = PickerSearchScope.DICTIONARY_LANGUAGE,
          bg = keyBg
        )
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          bindPickerScroll(
            this,
            "dictionary-language",
            "picker-option:dictionary-language:",
            dictionaryLanguageCode,
          )
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              setPadding(dp(2), 0, dp(2), 0)

              currentDictionaryLanguages().forEach { language ->
                addView(
                  TextView(context).apply {
                    val selected = language.code.equals(dictionaryLanguageCode, ignoreCase = true)
                    text = language.name
                    tag = "picker-option:dictionary-language:${language.code}"
                    setTextColor(
                      if (selected) color("pillLabel", "#111111") else label,
                    )
                    textSize = (fontSize - 1f).coerceAtLeast(11f)
                    typeface = keyTypeface
                    gravity = Gravity.CENTER_VERTICAL
                    minHeight = dp(34)
                    background =
                      roundedBg(if (selected) color("pill", "#FFFFFF") else keyBg, 12f)
                    setPadding(dp(10), dp(7), dp(10), dp(7))
                    layoutParams =
                      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(5)
                      }
                    setOnTouchListener(TapTouch(allowParentScroll = true) {
                      val previousCode = dictionaryLanguageCode
                      dictionaryLanguageCode = language.code
                      dictionaryLanguageName = language.name
                      persistCurrentDictionaryLanguage()
                      featureMode = FeatureMode.DICTIONARY
                      rebuild()
                      autoLookupAfterDictionaryLanguageChange(previousCode)
                    })
                  },
                )
              }
            },
          )
        },
      )
    }
  }

  private fun buildTtsLanguageVoicePicker(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#A1A1AA")

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Voice & Language"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.TTS
            rebuild()
          })
        },
      )

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.TOP
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)

          addView(
            buildTtsPickerColumn(
              sectionLabel = "Language",
              scrollOffsetKey = "tts-language",
              optionPrefix = "picker-option:tts-language:",
              options =
                ttsLanguagesForModel().map { language ->
                  Triple(
                    language.name,
                    language.code,
                    language.code.equals(ttsLanguageCode, ignoreCase = true),
                  )
                },
              bg = keyBg,
              fg = label,
              muted = muted,
            ) { index ->
              ttsLanguagesForModel().getOrNull(index)?.let { setTtsLanguage(it.code) }
              rebuild(resetPickerScrollKeys = setOf("tts-voice"))
            },
            LayoutParams(0, LayoutParams.MATCH_PARENT, 1f),
          )
          addView(
            buildTtsPickerColumn(
              sectionLabel = "Voice",
              scrollOffsetKey = "tts-voice",
              optionPrefix = "picker-option:tts-voice:",
              options =
                ttsVoicesForLanguage().map { voice ->
                  Triple(voice, voice, voice.equals(resolvedTtsVoice(), ignoreCase = true))
                },
              bg = keyBg,
              fg = label,
              muted = muted,
            ) { index ->
              ttsVoicesForLanguage().getOrNull(index)?.let { setTtsVoice(it) }
              refreshOpenPickerSelections()
            },
            LayoutParams(0, LayoutParams.MATCH_PARENT, 1f).apply { marginStart = dp(12) },
          )
        },
      )

      addView(
        TextView(context).apply {
          text = "Done"
          setTextColor(Color.WHITE)
          textSize = fontSize
          typeface = keyTypeface
          gravity = Gravity.CENTER
          minHeight = dp(38)
          background = roundedBg(accent, 999f)
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(8)
            }
          setOnTouchListener(TapTouch {
            featureMode = FeatureMode.TTS
            rebuild()
          })
        },
      )
    }
  }

  private fun buildTtsPickerColumn(
    sectionLabel: String,
    scrollOffsetKey: String,
    optionPrefix: String,
    options: List<Triple<String, String, Boolean>>,
    bg: Int,
    fg: Int,
    muted: Int,
    onSelect: (Int) -> Unit,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)

      addView(
        buildPickerSectionHeader(
          title = sectionLabel,
          scope = if (sectionLabel == "Language") PickerSearchScope.TTS_LANGUAGE else PickerSearchScope.TTS_VOICE,
          bg = bg
        )
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          bindPickerScroll(this, scrollOffsetKey, optionPrefix, options.find { it.third }?.second)
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              setPadding(dp(2), 0, dp(2), 0)

              options.forEachIndexed { index, (optionLabel, optionValue, selected) ->
            addView(
              TextView(context).apply {
                text = optionLabel
                tag = "$optionPrefix$optionValue"
                setTextColor(
                  if (selected) color("pillLabel", "#111111") else fg,
                )
                textSize = (fontSize - 1f).coerceAtLeast(11f)
                typeface = keyTypeface
                gravity = Gravity.CENTER_VERTICAL
                minHeight = dp(34)
                background =
                  roundedBg(if (selected) color("pill", "#FFFFFF") else bg, 12f)
                setPadding(dp(10), dp(7), dp(10), dp(7))
                layoutParams =
                  LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = dp(5)
                  }
                setOnTouchListener(TapTouch(allowParentScroll = true) { onSelect(index) })
              },
            )
          }
        },
      )
    },
  )
}

  private fun buildSttLanguagePicker(): LinearLayout {
    val languages = sttLanguagesForModel()
    return buildOptionPicker(
      title = "Speech Language",
      sectionLabel = "Recognize",
      scrollOffsetKey = "stt-language",
      optionPrefix = "picker-option:stt-language:",
      options =
        languages.map { language ->
          Triple(
            language.name,
            language.code,
            language.code.equals(sttLanguageCode, ignoreCase = true),
          )
        },
      onBack = { featureMode = FeatureMode.KEYBOARD; rebuild() },
      searchScope = PickerSearchScope.STT_LANGUAGE,
    ) { index ->
      languages.getOrNull(index)?.let { setSttLanguage(it.code, it.name) }
      featureMode = FeatureMode.KEYBOARD
      rebuild()
    }
  }

  private fun buildOptionPicker(
    title: String,
    sectionLabel: String,
    scrollOffsetKey: String,
    optionPrefix: String,
    options: List<Triple<String, String, Boolean>>,
    onBack: () -> Unit,
    searchScope: PickerSearchScope? = null,
    onSelect: (Int) -> Unit,
  ): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val muted = Color.parseColor("#71717A")

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = title
              setTextColor(keyBg)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch { onBack() })
        },
      )

      addView(
        buildPickerSectionHeader(
          title = sectionLabel,
          scope = PickerSearchScope.STT_LANGUAGE,
          bg = keyBg
        )
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          bindPickerScroll(this, scrollOffsetKey, optionPrefix, options.find { it.third }?.second)
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              setPadding(dp(2), 0, dp(2), 0)

              options.forEachIndexed { index, (optionLabel, optionValue, selected) ->
                addView(
                  TextView(context).apply {
                    text = optionLabel
                    tag = "$optionPrefix$optionValue"
                    setTextColor(
                      if (selected) color("pillLabel", "#111111") else label,
                    )
                    textSize = (fontSize - 1f).coerceAtLeast(11f)
                    typeface = keyTypeface
                    gravity = Gravity.CENTER_VERTICAL
                    minHeight = dp(34)
                    background =
                      roundedBg(if (selected) color("pill", "#FFFFFF") else keyBg, 12f)
                    setPadding(dp(10), dp(7), dp(10), dp(7))
                    layoutParams =
                      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(5)
                      }
                    setOnTouchListener(TapTouch(allowParentScroll = true) { onSelect(index) })
                  },
                )
              }
            },
          )
        },
      )
    }
  }

  private fun buildInferenceDebugView(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#A1A1AA")

    val request = buildDebugRequest()
    val messages = HypaInferenceContract.renderMessages(request)
    val sampling = HypaInferenceContract.sampling(debugTask)
    val runtime = HypaInferenceContract.runtime(InferenceHost.KEYBOARD)

    fun sectionLabel(text: String): TextView =
      TextView(context).apply {
        this.text = text
        setTextColor(muted)
        textSize = 10f
        typeface = keyTypeface
        setPadding(0, dp(6), 0, dp(2))
      }

    fun sectionBody(text: String): TextView =
      TextView(context).apply {
        this.text = text
        setTextColor(label)
        textSize = 11f
        typeface = Typeface.MONOSPACE
        background = roundedBg(keyBg, 6f)
        setPadding(dp(6), dp(5), dp(6), dp(5))
        layoutParams =
          LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(2)
          }
      }

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(4)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = 13f
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(26)
              minWidth = dp(26)
              background = roundedBg(toolbar, 999f)
              setOnTouchListener(TapTouch {
                featureMode = FeatureMode.KEYBOARD
                rebuild()
              })
            },
          )

          addView(
            TextView(context).apply {
              text = "Inference debug"
              setTextColor(label)
              textSize = 12f
              typeface = keyTypeface
              setPadding(dp(8), 0, dp(8), 0)
              layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
            },
          )

          addView(
            TextView(context).apply {
              text = "Run"
              setTextColor(Color.WHITE)
              textSize = 12f
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minWidth = dp(52)
              minHeight = dp(26)
              background = roundedBg(accent, 999f)
              setOnTouchListener(TapTouch { runInferenceDebug() })
            },
          )
        },
      )

      addView(
        HorizontalScrollView(context).apply {
          isHorizontalScrollBarEnabled = false
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(2)
            }
          addView(
            LinearLayout(context).apply {
              orientation = HORIZONTAL
              InferenceTask.entries.forEach { task ->
                addView(
                  TextView(context).apply {
                    text = task.id
                    setTextColor(if (task == debugTask) Color.WHITE else muted)
                    textSize = 10f
                    typeface = keyTypeface
                    gravity = Gravity.CENTER
                    minHeight = dp(24)
                    setPadding(dp(10), 0, dp(10), 0)
                    background = roundedBg(if (task == debugTask) accent else keyBg, 999f)
                    layoutParams =
                      LayoutParams(LayoutParams.WRAP_CONTENT, dp(24)).apply { marginEnd = dp(3) }
                    setOnTouchListener(
                      TapTouch {
                        debugTask = task
                        debugOutput = ""
                        rebuild()
                      },
                    )
                  },
                )
              }
            },
          )
        },
      )

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(2)
            }

          addView(
            EditText(context).apply {
              setText(debugText)
              hint = "Text for the model"
              setTextColor(label)
              setHintTextColor(muted)
              textSize = 11f
              typeface = Typeface.MONOSPACE
              background = roundedBg(keyBg, 6f)
              setPadding(dp(6), dp(5), dp(6), dp(5))
              minLines = 2
              maxLines = 3
              inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
              layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
              addTextChangedListener(
                object : TextWatcher {
                  override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit

                  override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit

                  override fun afterTextChanged(s: Editable?) {
                    debugText = s?.toString().orEmpty()
                  }
                },
              )
            },
          )

          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              layoutParams =
                LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                  marginStart = dp(3)
                }

              fun sideButton(caption: String, onTap: () -> Unit): TextView =
                TextView(context).apply {
                  text = caption
                  setTextColor(label)
                  textSize = 10f
                  typeface = keyTypeface
                  gravity = Gravity.CENTER
                  minWidth = dp(46)
                  minHeight = dp(24)
                  background = roundedBg(toolbar, 6f)
                  layoutParams =
                    LayoutParams(LayoutParams.WRAP_CONTENT, dp(24)).apply { bottomMargin = dp(3) }
                  setOnTouchListener(TapTouch { onTap() })
                }

              addView(
                sideButton("Paste") {
                  debugText = HypaKeyboardClipStore.currentClipText(context) ?: debugText
                  debugOutput = ""
                  rebuild()
                },
              )
              addView(
                sideButton("Field") {
                  debugText = readDebugTextFromField()
                  debugOutput = ""
                  rebuild()
                },
              )
            },
          )
        },
      )

      addView(
        ScrollView(context).apply {
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL

              addView(sectionLabel("SYSTEM PROMPT"))
              addView(sectionBody(messages.firstOrNull { it.role == "system" }?.content.orEmpty()))

              addView(sectionLabel("USER PROMPT"))
              addView(sectionBody(messages.firstOrNull { it.role == "user" }?.content.orEmpty()))

              addView(
                sectionLabel(
                  "PARAMS · n_ctx ${runtime.contextSize} · in cap ${sampling.maxInputChars}ch · " +
                    "max ${sampling.maxTokens}tok · temp ${sampling.temperature}" +
                    if (sampling.candidateCount > 1) " · top ${sampling.candidateCount} words"
                    else "",
                ),
              )

              if (debugOutput.isNotEmpty()) {
                addView(sectionLabel("RESULT"))
                addView(sectionBody(debugOutput))
              }
            },
          )
        },
      )
    }
  }

  private fun buildEmojiView(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#A1A1AA")

    val cell = dp(44)
    val adapter =
      EmojiGridAdapter(
        cellSizePx = cell,
        textSizeSp = 28f,
        textColor = label,
        onPick = { entry -> insertEmoji(entry.sequence) },
        onPickAndHold = { view, entry -> showEmojiVariantPicker(view, entry) },
      )

    val grid =
      RecyclerView(context).apply {
        layoutManager = GridLayoutManager(context, EMOJI_GRID_COLUMNS)
        setHasFixedSize(true)
        this.adapter = adapter
        overScrollMode = OVER_SCROLL_NEVER
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
      }

    val categoryTabs = mutableListOf<ImageView>()
    fun showCategory(index: Int) {
      emojiCategoryIndex = index
      categoryTabs.forEachIndexed { i, tab ->
        tab.setColorFilter(if (i == index) Color.WHITE else muted)
        tab.background = roundedBg(if (i == index) accent else Color.TRANSPARENT, 999f)
      }
      adapter.submit(emojiEntriesForCategory(index))
      grid.scrollToPosition(0)
    }

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(4), dp(4), dp(4), dp(4))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, dp(30)).apply { bottomMargin = dp(4) }
          addView(pickerSearchButton(PickerSearchScope.EMOJI, color("label", "#FFFFFF")).apply {
            contentDescription = "Search emoji"
            layoutParams = LayoutParams(dp(30), dp(30))
          })
          emojiCategoryTabs().forEachIndexed { index, tab ->
            val icon =
              ImageView(context).apply {
                setImageResource(tab.iconRes)
                contentDescription = tab.title
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                val inset = dp(5)
                setPadding(inset, inset, inset, inset)
                layoutParams = LayoutParams(0, dp(30), 1f).apply { marginEnd = dp(2) }
                setOnClickListener { showCategory(index) }
              }
            categoryTabs += icon
            addView(icon)
          }
        },
      )

      addView(grid)

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(4)
            }

          addView(
            TextView(context).apply {
              text = "ABC"
              setTextColor(label)
              textSize = 13f
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(34)
              minWidth = dp(64)
              background = pressableKeyBg(toolbar, 999f)
              setOnTouchListener(KeyTouch(triggerOnDown = true) { closeEmojiPanel() })
            },
          )
          addView(View(context).apply { layoutParams = LayoutParams(0, dp(1), 1f) })
          addView(
            TextView(context).apply {
              text = "⌫"
              setTextColor(label)
              textSize = 15f
              gravity = Gravity.CENTER
              minHeight = dp(34)
              minWidth = dp(64)
              background = pressableKeyBg(toolbar, 999f)
              setOnTouchListener(DeleteKeyTouch())
            },
          )
        },
      )

      showCategory(emojiCategoryIndex.coerceIn(0, emojiCategoryTabs().size - 1))
    }
  }

  private fun emojiCategoryTabs(): List<EmojiCategoryTab> =
    listOf(EmojiCategoryTab(RECENT_CATEGORY_TITLE, R.drawable.ic_emoji_recent)) +
      emojiRepository.groups().map { group ->
        val icon =
          when {
            group.name.startsWith("Smileys") -> R.drawable.ic_emoji_smileys
            group.name.startsWith("People") -> R.drawable.ic_emoji_people
            group.name.startsWith("Animals") -> R.drawable.ic_emoji_nature
            group.name.startsWith("Food") -> R.drawable.ic_emoji_food
            group.name.startsWith("Travel") -> R.drawable.ic_emoji_travel
            group.name.startsWith("Activities") -> R.drawable.ic_emoji_activities
            group.name.startsWith("Objects") -> R.drawable.ic_emoji_objects
            group.name.startsWith("Flags") -> R.drawable.ic_emoji_flags
            else -> R.drawable.ic_emoji_symbols
          }
        EmojiCategoryTab(group.name, icon)
      }

  private data class EmojiCategoryTab(val title: String, val iconRes: Int)

  private fun emojiEntriesForCategory(index: Int): List<EmojiEntry> {
    if (index <= 0) {
      return recentEmojiStore.recent().map { EmojiEntry(sequence = it, name = "") }
    }
    return emojiRepository.groups().getOrNull(index - 1)?.entries.orEmpty()
  }

  private fun insertEmoji(sequence: String) {
    if (sequence.isEmpty()) return
    recentEmojiStore.record(sequence)
    commitTrackedText(sequence, countAsTyping = true)
  }

  private fun showEmojiVariantPicker(anchor: View, entry: EmojiEntry) {
    if (!entry.hasVariants) return
    dismissEmojiVariantPopup()

    val options = listOf(entry.sequence) + entry.variants
    val content =
      LinearLayout(context).apply {
        orientation = VERTICAL
        background = roundedBg(color("toolbar", "#515151"), 14f)
        setPadding(dp(6), dp(6), dp(6), dp(6))
        options.chunked(EMOJI_VARIANT_COLUMNS).forEach { rowOptions ->
          addView(
            LinearLayout(context).apply {
              orientation = HORIZONTAL
              rowOptions.forEach { sequence ->
                addView(
                  TextView(context).apply {
                    text = sequence
                    textSize = 26f
                    typeface = Typeface.DEFAULT
                    gravity = Gravity.CENTER
                    includeFontPadding = false
                    background = roundedBg(Color.TRANSPARENT, 999f)
                    layoutParams =
                      LinearLayout.LayoutParams(dp(40), dp(40)).apply { marginEnd = dp(2) }
                    setOnClickListener {
                      dismissEmojiVariantPopup()
                      insertEmoji(sequence)
                    }
                  },
                )
              }
            },
          )
        }
      }

    content.measure(
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    val popup =
      PopupWindow(content, content.measuredWidth, content.measuredHeight, false).apply {
        isOutsideTouchable = true
        isTouchable = true
        elevation = dp(12).toFloat()
        setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
        setOnDismissListener { if (emojiVariantPopup === this) emojiVariantPopup = null }
      }
    emojiVariantPopup = popup
    pulse()
    popup.showAsDropDown(
      anchor,
      ((anchor.width - content.measuredWidth) / 2f).roundToInt(),
      -(anchor.height + content.measuredHeight + dp(6)),
    )
  }

  private fun dismissEmojiVariantPopup() {
    emojiVariantPopup?.dismiss()
    emojiVariantPopup = null
  }

  private fun openEmojiPanel() {
    emojiRepository.warmup(onLoaded = {
      mainHandler.post {
        if (featureMode == FeatureMode.EMOJI || pickerSearchScope == PickerSearchScope.EMOJI) rebuild()
      }
    })
    featureMode = FeatureMode.EMOJI
  }

  private fun closeEmojiPanel() {
    featureMode = FeatureMode.KEYBOARD
    rebuild()
  }

  private fun buildDictionaryResultView(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val muted = Color.parseColor("#A1A1AA")

    val result = latestDictionaryResult

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      minimumHeight = keyboardHeightPx
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)
      setPadding(dp(8), dp(6), dp(8), dp(8))

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams =
            LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(8)
            }

          addView(
            TextView(context).apply {
              text = "←"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER
              minHeight = dp(28)
              minWidth = dp(28)
              background = roundedBg(toolbar, 999f)
              setPadding(dp(8), dp(4), dp(8), dp(4))
            },
          )

          addView(
            TextView(context).apply {
              text = "Dictionary Result"
              setTextColor(label)
              textSize = fontSize.coerceAtLeast(13f)
              typeface = keyTypeface
              gravity = Gravity.CENTER_VERTICAL
              setPadding(dp(8), 0, 0, 0)
            },
          )

          setOnTouchListener(TapTouch {
            stopTts()
            dictionaryLookupRequestId += 1
            featureMode = FeatureMode.DICTIONARY
            rebuild()
          })
        },
      )

      addView(
        ScrollView(context).apply {
          isVerticalScrollBarEnabled = false
          isFillViewport = true
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)

          addView(
            LinearLayout(context).apply {
              orientation = VERTICAL
              background = roundedBg(keyBg, 16f)
              setPadding(dp(16), dp(16), dp(16), dp(16))
              layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

              if (result == null) {
                addView(
                  TextView(context).apply {
                    text = KeyboardErrorCatalog.noResult
                    setTextColor(label)
                    textSize = (fontSize - 1f).coerceAtLeast(11f)
                    typeface = keyTypeface
                  },
                )
                return@apply
              }

              addView(buildDictionaryHeroRow(result, label, muted))

              if (result.definitions.isNotEmpty()) {
                addView(dictionaryDivider())
                addView(
                  buildDictionaryDefinitionSection(
                    result.definitions,
                    label,
                    muted,
                  ),
                )
              }

              if (result.synonyms.isNotEmpty()) {
                addView(dictionaryDivider())
                addView(buildDictionaryTagSection("Synonyms", result.synonyms, label, muted))
              }

              if (result.antonyms.isNotEmpty()) {
                addView(dictionaryDivider())
                addView(buildDictionaryTagSection("Antonyms", result.antonyms, label, muted))
              }

              val usageItems =
                if (result.usageExamples.isNotEmpty()) {
                  result.usageExamples
                } else {
                  result.exampleSentences.map { DictionaryUsageItem("", it) }
                }
              if (usageItems.isNotEmpty()) {
                addView(dictionaryDivider())
                addView(buildDictionaryUsageSection(usageItems, label, muted))
              }

              if (!result.culturalContext.isNullOrBlank()) {
                addView(dictionaryDivider())
                addView(buildDictionaryQuoteCard("Cultural Context", result.culturalContext, label, muted))
              }

              if (!result.funFact.isNullOrBlank()) {
                addView(dictionaryDivider())
                addView(buildDictionaryQuoteCard("Fun Fact", result.funFact, label, muted))
              }
            },
          )
        },
      )
    }
  }

  private fun buildDictionaryHeroRow(
    result: DictionaryResultCardData,
    label: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

      addView(
        LinearLayout(context).apply {
          orientation = HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

          addView(
            dictionarySpeechButton(
              identifier = "dictionary-word",
              iconRes = activeDictionaryIconRes("dictionary-word"),
              backgroundColor = color("toolbar", "#18181B"),
              tint = label,
              sizeDp = 28,
            ) {
              speakDictionaryText(
                dictionaryWordSpeechText(result.word),
                result.language.ifBlank { dictionaryLanguageName },
                "dictionary-word",
              )
            },
          )

          addView(
            TextView(context).apply {
              text = result.word
              setTextColor(label)
              textSize = (fontSize + 7f).coerceAtLeast(22f)
              typeface = Typeface.create(keyTypeface, Typeface.BOLD)
              layoutParams =
                LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply {
                  marginStart = dp(8)
                  marginEnd = dp(8)
                }
            },
          )

          addView(
            dictionarySpeechButton(
              identifier = "dictionary-full",
              iconRes = activeDictionaryIconRes("dictionary-full"),
              backgroundColor = dictionaryPrimaryListenBackgroundColor(),
              tint = dictionaryPrimaryListenTintColor(),
              sizeDp = 36,
            ) {
              speakDictionaryText(
                dictionarySpeechText(result),
                result.language.ifBlank { dictionaryLanguageName },
                "dictionary-full",
              )
            },
          )
        },
      )

      if (!result.pronunciation.isNullOrBlank() || result.language.isNotBlank()) {
        addView(
          LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(6)
            }

            if (!result.pronunciation.isNullOrBlank()) {
              addView(
                TextView(context).apply {
                  text = "/${result.pronunciation}/"
                  setTextColor(muted)
                  textSize = (fontSize - 2f).coerceAtLeast(11f)
                  typeface = Typeface.create(keyTypeface, Typeface.ITALIC)
                },
              )
            }

            if (!result.language.isBlank()) {
              addView(
                TextView(context).apply {
                  text = result.language
                  setTextColor(muted)
                  textSize = (fontSize - 3f).coerceAtLeast(11f)
                  typeface = keyTypeface
                  layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                    marginStart = dp(8)
                  }
                },
              )
            }
          },
        )
      }
    }

  private fun buildDictionaryDefinitionSection(
    definitions: List<DictionaryDefinitionItem>,
    label: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      addView(
        dictionarySectionHeader(
          title = "Definition",
          muted = muted,
          identifier = "definition",
        ) {
          speakDictionaryText(
            dictionarySectionSpeechText("Definition", dictionaryDefinitionSpeechText(definitions)),
            dictionaryLanguageName,
            "definition",
          )
        },
      )
      definitions.forEach { definition ->
        addView(
          LinearLayout(context).apply {
            orientation = VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(6)
            }
            if (!definition.partOfSpeech.isNullOrBlank()) {
              addView(
                TextView(context).apply {
                  text = definition.partOfSpeech.replaceFirstChar { it.titlecase(Locale.getDefault()) }
                  setTextColor(label)
                  textSize = (fontSize - 3f).coerceAtLeast(11f)
                  typeface = Typeface.create(keyTypeface, Typeface.BOLD)
                },
              )
            }
            addView(
              TextView(context).apply {
                text = "• ${definition.text}"
                setTextColor(label)
                textSize = (fontSize - 3f).coerceAtLeast(11f)
                typeface = Typeface.create(keyTypeface, Typeface.ITALIC)
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                  topMargin = dp(2)
                }
              },
            )
          },
        )
      }
    }

  private fun buildDictionaryTagSection(
    title: String,
    items: List<String>,
    label: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      val speechIdentifier =
        when (title) {
          "Synonyms" -> "synonyms"
          "Antonyms" -> "antonyms"
          else -> title.lowercase(Locale.getDefault()).replace(" ", "-")
        }
      addView(
        dictionarySectionHeader(
          title = title,
          muted = muted,
          identifier = speechIdentifier,
        ) {
          speakDictionaryText(
            dictionarySectionSpeechText(title, items.joinToString(", ")),
            dictionaryLanguageName,
            speechIdentifier,
          )
        },
      )
      addView(
        HorizontalScrollView(context).apply {
          isHorizontalScrollBarEnabled = false
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
          }
          addView(
            LinearLayout(context).apply {
              orientation = HORIZONTAL
              items.forEachIndexed { index, item ->
                addView(
                  TextView(context).apply {
                    text = item
                    setTextColor(label)
                    textSize = (fontSize - 3f).coerceAtLeast(10f)
                    typeface = keyTypeface
                    background = roundedBg(color("surface", "#121214"), 10f)
                    setPadding(dp(12), dp(6), dp(12), dp(6))
                    layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
                      if (index > 0) marginStart = dp(8)
                    }
                  },
                )
              }
            },
          )
        },
      )
    }

  private fun buildDictionaryUsageSection(
    usageItems: List<DictionaryUsageItem>,
    label: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      addView(
        dictionarySectionHeader(
          title = "Usage Examples",
          muted = muted,
          identifier = "usage-examples",
        ) {
          speakDictionaryText(
            dictionarySectionSpeechText("Usage Examples", dictionaryUsageSpeechText(usageItems)),
            dictionaryLanguageName,
            "usage-examples",
          )
        },
      )
      usageItems.forEach { item ->
        addView(
          TextView(context).apply {
            val prefix =
              item.partOfSpeech.trim().takeIf { it.isNotEmpty() }?.let {
                "${it.replaceFirstChar { ch -> ch.titlecase(Locale.getDefault()) }}. "
              }.orEmpty()
            text = "• $prefix${item.example}"
            setTextColor(label)
            textSize = (fontSize - 3f).coerceAtLeast(11f)
            typeface = Typeface.create(keyTypeface, Typeface.ITALIC)
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(6)
            }
          },
        )
      }
    }

  private fun buildDictionaryQuoteCard(
    title: String,
    body: String,
    label: Int,
    muted: Int,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = VERTICAL
      background = roundedBg(color("surface", "#121214"), 14f)
      setPadding(dp(12), dp(12), dp(12), dp(12))
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      val speechIdentifier =
        when (title) {
          "Cultural Context" -> "cultural-context"
          "Fun Fact" -> "fun-fact"
          else -> title.lowercase(Locale.getDefault()).replace(" ", "-")
        }
      addView(
        dictionarySectionHeader(
          title = title,
          muted = muted,
          identifier = speechIdentifier,
        ) {
          speakDictionaryText(
            dictionarySectionSpeechText(title, body),
            dictionaryLanguageName,
            speechIdentifier,
          )
        },
      )
      addView(
        TextView(context).apply {
          text = body
          setTextColor(label)
          textSize = (fontSize - 1f).coerceAtLeast(12f)
          typeface = keyTypeface
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
          }
        },
      )
    }

  private fun dictionarySectionHeader(
    title: String,
    muted: Int,
    identifier: String,
    onClick: () -> Unit,
  ): LinearLayout =
    LinearLayout(context).apply {
      orientation = HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      addView(dictionarySectionTitle(title, muted))
      addView(
        View(context).apply {
          layoutParams = LayoutParams(0, 0, 1f)
        },
      )
      addView(
        dictionarySpeechButton(
          identifier = identifier,
          iconRes = activeDictionaryIconRes(identifier),
          backgroundColor = color("toolbar", "#18181B"),
          tint = muted,
          sizeDp = 28,
          onClick = onClick,
        ),
      )
    }

  private fun dictionarySectionTitle(title: String, muted: Int): TextView =
    TextView(context).apply {
      text = title.uppercase(Locale.getDefault())
      setTextColor(muted)
      textSize = (fontSize - 4f).coerceAtLeast(10f)
      typeface = Typeface.create(keyTypeface, Typeface.BOLD)
    }

  private fun dictionaryDivider(): View =
    View(context).apply {
      setBackgroundColor(color("label", "#EAEAEE").let { Color.argb(31, Color.red(it), Color.green(it), Color.blue(it)) })
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(1)).apply {
        topMargin = dp(12)
        bottomMargin = dp(12)
      }
    }

  private fun dictionarySpeechButton(
    identifier: String,
    iconRes: Int,
    backgroundColor: Int,
    tint: Int,
    sizeDp: Int,
    onClick: () -> Unit,
  ): FrameLayout {
    val isLoading = isTtsLoading && activeDictionarySpeechIdentifier == identifier
    val isDisabled = isTtsLoading && activeDictionarySpeechIdentifier != identifier
    return FrameLayout(context).apply {
      background = roundedBg(backgroundColor, 999f)
      alpha = if (isDisabled) 0.55f else 1f
      layoutParams = LayoutParams(dp(sizeDp), dp(sizeDp))
      if (isLoading) {
        addView(
          ProgressBar(context).apply {
            isIndeterminate = true
            indeterminateTintList = android.content.res.ColorStateList.valueOf(tint)
            layoutParams = FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER)
          },
        )
      } else {
        addView(
          ImageView(context).apply {
            setImageResource(iconRes)
            setColorFilter(tint)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            val inset = dp(if (sizeDp >= 36) 10 else 8)
            setPadding(inset, inset, inset, inset)
            layoutParams = FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
          },
        )
      }
      if (!isDisabled) {
        setOnTouchListener(TapTouch {
          if (activeDictionarySpeechIdentifier == identifier && (isTtsLoading || isTtsPlaying)) {
            stopTts()
          } else {
            if (isTtsPlaying || isTtsLoading) stopTts()
            onClick()
          }
        })
      }
    }
  }

  private fun activeDictionaryIconRes(identifier: String): Int =
    if (isTtsPlaying && activeDictionarySpeechIdentifier == identifier) {
      R.drawable.ic_audio_stop
    } else {
      R.drawable.ic_mode_audio
    }

  private fun dictionaryPrimaryListenBackgroundColor(): Int =
    blendColors(Color.parseColor("#22C55E"), color("accent", "#3B82F6"), 0.22f)

  private fun dictionaryPrimaryListenTintColor(): Int =
    foregroundColorForBackground(dictionaryPrimaryListenBackgroundColor())

  private fun blendColors(first: Int, second: Int, ratio: Float): Int {
    val clamped = ratio.coerceIn(0f, 1f)
    val inverse = 1f - clamped
    return Color.argb(
      ((Color.alpha(first) * inverse) + (Color.alpha(second) * clamped)).roundToInt(),
      ((Color.red(first) * inverse) + (Color.red(second) * clamped)).roundToInt(),
      ((Color.green(first) * inverse) + (Color.green(second) * clamped)).roundToInt(),
      ((Color.blue(first) * inverse) + (Color.blue(second) * clamped)).roundToInt(),
    )
  }

  private fun foregroundColorForBackground(background: Int): Int {
    val label = color("label", "#EAEAEE")
    val surface = color("surface", "#121214")
    val labelContrast = contrastRatio(background, label)
    val surfaceContrast = contrastRatio(background, surface)
    return if (labelContrast >= surfaceContrast) label else surface
  }

  private fun contrastRatio(first: Int, second: Int): Double {
    val lighter = maxOf(relativeLuminance(first), relativeLuminance(second))
    val darker = minOf(relativeLuminance(first), relativeLuminance(second))
    return (lighter + 0.05) / (darker + 0.05)
  }

  private fun relativeLuminance(colorInt: Int): Double {
    fun channel(value: Int): Double {
      val normalized = value / 255.0
      return if (normalized <= 0.03928) {
        normalized / 12.92
      } else {
        Math.pow((normalized + 0.055) / 1.055, 2.4)
      }
    }
    return (0.2126 * channel(Color.red(colorInt))) +
      (0.7152 * channel(Color.green(colorInt))) +
      (0.0722 * channel(Color.blue(colorInt)))
  }

  private fun cleanDictionarySpeechText(value: String): String =
    value.replace(Regex("\\s+"), " ").trim()

  private fun dictionaryWordSpeechText(word: String): String =
    cleanDictionarySpeechText(word)

  private fun dictionarySectionSpeechText(title: String, body: String): String {
    val trimmedBody = body.trim()
    return if (trimmedBody.isEmpty()) {
      cleanDictionarySpeechText(title)
    } else {
      cleanDictionarySpeechText("$title. $trimmedBody")
    }
  }

  private fun dictionaryDefinitionSpeechText(result: DictionaryResultCardData): String =
    dictionaryDefinitionSpeechText(result.definitions)

  private fun dictionaryDefinitionSpeechText(definitions: List<DictionaryDefinitionItem>): String =
    definitions.joinToString(". ") { definition ->
      if (!definition.partOfSpeech.isNullOrBlank()) {
        cleanDictionarySpeechText("${definition.partOfSpeech}. ${stripMarkdownFormatting(definition.text)}")
      } else {
        cleanDictionarySpeechText(stripMarkdownFormatting(definition.text))
      }
    }

  private fun dictionaryUsageSpeechText(usageItems: List<DictionaryUsageItem>): String =
    usageItems.map { item ->
      if (item.partOfSpeech.isNotBlank()) {
        cleanDictionarySpeechText("${item.partOfSpeech}. ${stripMarkdownFormatting(item.example)}")
      } else {
        cleanDictionarySpeechText(stripMarkdownFormatting(item.example))
      }
    }.joinToString(". ")

  private fun dictionaryUsageSpeechText(result: DictionaryResultCardData): String {
    val usageItems =
      if (result.usageExamples.isNotEmpty()) {
        result.usageExamples
      } else {
        result.exampleSentences.map { DictionaryUsageItem("", it) }
      }
    return dictionaryUsageSpeechText(usageItems)
  }

  private fun dictionarySpeechText(result: DictionaryResultCardData): String {
    val parts = mutableListOf(dictionarySectionSpeechText("Word", dictionaryWordSpeechText(result.word)))

    dictionaryDefinitionSpeechText(result).takeIf { it.isNotBlank() }?.let {
      parts += dictionarySectionSpeechText("Definition", it)
    }
    if (result.synonyms.isNotEmpty()) {
      parts += dictionarySectionSpeechText("Synonyms", result.synonyms.joinToString(", "))
    }
    if (result.antonyms.isNotEmpty()) {
      parts += dictionarySectionSpeechText("Antonyms", result.antonyms.joinToString(", "))
    }
    dictionaryUsageSpeechText(result).takeIf { it.isNotBlank() }?.let {
      parts += dictionarySectionSpeechText("Usage Examples", it)
    }
    result.culturalContext?.takeIf { it.isNotBlank() }?.let {
      parts += dictionarySectionSpeechText("Cultural Context", it)
    }
    result.funFact?.takeIf { it.isNotBlank() }?.let {
      parts += dictionarySectionSpeechText("Fun Fact", it)
    }

    return parts.joinToString(". ")
  }

  private fun stripMarkdownFormatting(text: String): String =
    text.replace("**", "").replace("*", "")

  private fun hasMicPermission(): Boolean =
    context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
      android.content.pm.PackageManager.PERMISSION_GRANTED

  private fun requestMicPermission() {
    val intent = android.content.Intent(context, MicPermissionActivity::class.java).apply {
      addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    runCatching { context.startActivity(intent) }
      .onFailure { Log.w(TAG, "Mic permission activity launch failed", it) }
  }

  private fun toggleSttRecord() {
    if (isSttTranscribing) return
    if (isSttRecording) stopSttRecordingAndTranscribe() else startSttRecording()
  }

  private fun startSttRecording() {
    if (isSttRecording || isSttTranscribing) return
    if (!hasMicPermission()) {
      showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.micNeeded)
      requestMicPermission()
      return
    }
    if (sttConnState != SttConnState.IDLE) stopSttListening()

    sttRecordedAudioBytes = null
    val outFile = runCatching {
      java.io.File.createTempFile("hypa_stt_", ".m4a", context.cacheDir)
    }.getOrNull() ?: return

    val recorder = runCatching {
      val r = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
        MediaRecorder(context)
      } else {
        @Suppress("DEPRECATION") MediaRecorder()
      }
      r.setAudioSource(MediaRecorder.AudioSource.MIC)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setOutputFile(outFile.absolutePath)
      r.prepare()
      r.start()
      r
    }.onFailure { Log.w(TAG, "STT MediaRecorder start failed", it) }.getOrNull()

    if (recorder == null) {
      runCatching { outFile.delete() }
      showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.recordingFailed)
      return
    }

    sttRecorder = recorder
    sttRecordedFile = outFile
    isSttRecording = true
    sttRecordStartMs = System.currentTimeMillis()
    sttLiveText?.text = "Recording…"
    startSttRecordTicker()
    rebuild()
  }

  private fun stopSttRecordingOnly(): Boolean {
    if (!isSttRecording) return sttRecordedFile != null
    val recorder = sttRecorder
    val file = sttRecordedFile
    sttRecorder = null
    val ok = runCatching { recorder?.stop(); recorder?.release() }.isSuccess
    val duration = (System.currentTimeMillis() - sttRecordStartMs).coerceAtLeast(0L)
    isSttRecording = false
    stopSttRecordTicker()
    val recordedBytes =
      if (ok && file != null) {
        runCatching { file.readBytes() }.getOrNull()?.takeIf { it.isNotEmpty() }
      } else {
        null
      }
    if (!ok || file == null || recordedBytes == null) {
      runCatching { file?.delete() }
      sttRecordedFile = null
      sttRecordedAudioBytes = null
      sttRecordDurationMs = 0L
      showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.recordingFailed)
      return false
    }
    sttRecordedAudioBytes = recordedBytes
    sttRecordDurationMs = duration
    rebuild()
    return true
  }

  private fun stopSttRecordingAndTranscribe() {
    if (!stopSttRecordingOnly()) return
    transcribeRecordedFile()
  }

  private fun transcribeRecordedFile() {
    val audioBytes = sttAudioBytesForRequest()
    val file = sttRecordedFile
    if (audioBytes == null) {
      sttRecordedFile = null
      sttRecordedAudioBytes = null
      sttRecordDurationMs = 0L
      sttLiveText?.text = "Record again"
      appendSentLog("ASR skipped: no recorded audio available")
      rebuild()
      return
    }
    if (isSttTranscribing) return

    val keepFileForPlayback = isAudioMenuOpen
    isSttTranscribing = true
    sttLiveText?.text = "Transcribing…"
    rebuild()

    val token = apiToken.trim()
    Thread {
      runCatching {
        val b64 = android.util.Base64.encodeToString(audioBytes, android.util.Base64.NO_WRAP)
        val sttModelName = sttModel.ifBlank { KeyboardLanguageCatalog.defaultSttModelName }
        val serviceModel =
          KeyboardLanguageCatalog.resolveStt(sttProvider, sttModelName)
        val body = JSONObject()
          .put("audio", b64)
          .put("audio_type", "base64")
          .put("model", serviceModel.model)
          .put("provider", serviceModel.provider)
          .apply {
            if (!sttLanguageCode.equals("auto", ignoreCase = true)) put("language", sttLanguageName)
          }
          .toString()
        val request = Request.Builder()
          .url(HypaApi.url("/v2/translate/stt"))
          .addHeader("Accept", HypaApi.JSON_UTF8)
          .apply {
            if (token.isNotBlank()) {
              addHeader("Authorization", "Bearer $token")
            }
          }
          .post(body.toRequestBody(HypaApi.JSON_UTF8.toMediaType()))
          .build()
        val asrClient = OkHttpClient.Builder()
          .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
          .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
          .readTimeout(120, java.util.concurrent.TimeUnit.SECONDS)
          .callTimeout(180, java.util.concurrent.TimeUnit.SECONDS)
          .build()
        HypaApi.logRequest("ASR", request.url)
        appendSentLog("ASR POST → ${request.url} (audio=${audioBytes.size}B b64=${b64.length}B)")
        val resp = asrClient.newCall(request).execute()
        val bodyStr = resp.body?.string()
        HypaApi.logResponse("ASR", resp.code, bodyStr)
        Log.i(TAG, "ASR raw code=${resp.code} body=$bodyStr")
        appendRecvLog("ASR ${resp.code} body: ${bodyStr ?: "(empty)"}")
        if (resp.isSuccessful && bodyStr != null) {
          val parsed = runCatching { JSONObject(bodyStr) }.getOrNull()
          val text = parsed?.optJSONObject("response")?.optString("text")?.trim()
            ?: parsed?.optString("text")?.trim()?.takeIf { it.isNotBlank() }
            ?: parsed?.optString("transcript")?.trim()?.takeIf { it.isNotBlank() }
          appendRecvLog("ASR parsed text → ${text ?: "(no text)"}")
          mainHandler.post {
            isSttTranscribing = false
            if (!text.isNullOrBlank() && !HypaApi.isInvalidGeneratedText(text)) {
              if (!keepFileForPlayback) {
                sttRecordedAudioBytes = null
                if (sttRecordedFile == file) {
                  sttRecordedFile = null
                  runCatching { file?.delete() }
                }
              }
              val appended = if (sttCapturedText.isBlank()) text else "$sttCapturedText $text"
              sttCapturedText = appended
              sttLiveText?.text = appended
              val chunk = "$text "
              val ic = inputSupplier()
              val committed = ic?.let { textEngine.commitText(it, chunk) } ?: false
              Log.i(TAG, "ASR commitText ok=$committed icPresent=${ic != null} text=$text")
              if (committed) {
                discardTranslationUndo(refreshUi = false)
                sttLastCommitted += chunk
                appendSentLog("Committed to input: $chunk")
                runCatching {
                  android.widget.Toast.makeText(
                    context.applicationContext,
                    "Inserted: ${text.take(40)}${if (text.length > 40) "…" else ""}",
                    android.widget.Toast.LENGTH_SHORT,
                  ).show()
                }
              } else {
                appendSentLog("Commit FAILED (icPresent=${ic != null}): $chunk")
                runCatching {
                  android.widget.Toast.makeText(
                    context.applicationContext,
                    "No active input — text not inserted",
                    android.widget.Toast.LENGTH_SHORT,
                  ).show()
                }
              }
              rebuild()
            } else {
              showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.noSpeech)
              appendRecvLog("Skipped commit: empty/blank text from ASR")
            }
          }
        } else {
          Log.w(TAG, "ASR error: ${resp.code} $bodyStr")
          appendRecvLog("ASR ${resp.code}: ${bodyStr?.take(120) ?: "(empty body)"}")
          mainHandler.post {
            isSttTranscribing = false
            showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.http(resp.code))
          }
        }
      }.onFailure {
        Log.w(TAG, "ASR request failed", it)
        mainHandler.post {
          isSttTranscribing = false
          showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.from(it))
        }
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun startSttRecordTicker() {
    stopSttRecordTicker()
    sttRecordTickRunnable = object : Runnable {
      override fun run() {
        if (!isSttRecording) return
        val elapsed = System.currentTimeMillis() - sttRecordStartMs
        if (elapsed >= MAX_STT_RECORD_MS) {
          sttRecordTimerView?.text = formatRecDuration(MAX_STT_RECORD_MS)
          stopSttRecordingOnly()
          return
        }
        sttRecordTimerView?.text = formatRecDuration(elapsed)
        val amp = runCatching { sttRecorder?.maxAmplitude ?: 0 }.getOrDefault(0)
        val level = (amp / 22000f).coerceIn(0f, 1f)
        sttWaveformView?.pushAmplitude(level)
        mainHandler.postDelayed(this, 80L)
      }
    }
    mainHandler.post(sttRecordTickRunnable!!)
  }

  private fun stopSttRecordTicker() {
    sttRecordTickRunnable?.let { mainHandler.removeCallbacks(it) }
    sttRecordTickRunnable = null
  }

  private fun abortSttRecording() {
    if (!isSttRecording && sttRecorder == null && sttRecordedFile == null) return
    val recorder = sttRecorder
    sttRecorder = null
    runCatching { recorder?.stop() }
    runCatching { recorder?.release() }
    isSttRecording = false
    stopSttRecordTicker()
    runCatching { sttRecordedFile?.delete() }
    sttRecordedFile = null
    sttRecordedAudioBytes = null
    sttRecordStartMs = 0L
  }

  private fun formatRecDuration(ms: Long): String {
    val s = (ms / 1000L).toInt()
    return "%d:%02d".format(s / 60, s % 60)
  }

  private fun startSttListening() {
    if (isSttRecording || isSttTranscribing) {
      appendSentLog("ignored: record in progress")
      return
    }
    when (sttConnState) {
      SttConnState.CONNECTING -> {
        appendSentLog("ignored: already connecting")
        return
      }
      SttConnState.CONNECTED -> {
        stopSttListening()
        return
      }
      SttConnState.DISCONNECTING -> {
        appendSentLog("ignored: still disconnecting")
        return
      }
      SttConnState.IDLE -> Unit
    }
    if (apiToken.isBlank()) {
      showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.signInRequired)
      appendSentLog("WS skipped: missing auth token")
      return
    }
    if (!hasMicPermission()) {
      showToolbarError(ToolbarErrorSlot.STT, KeyboardErrorCatalog.micNeeded)
      requestMicPermission()
      return
    }

    clearSttLiveError()
    sttConnState = SttConnState.CONNECTING
    sttLiveText?.text = "Connecting…"

    val uri = HypaApi.wsUri("/v2/translate/stt/ws")
    val headers = HashMap<String, String>().apply {
      put("Sec-WebSocket-Protocol", "key-$apiToken")
    }

    appendSentLog("WS connect → $uri (Java-WebSocket)")
    appendSentLog("Protocol: key-${apiToken.take(6)}…")

    val client = object : WebSocketClient(uri, headers) {
      override fun onOpen(handshake: ServerHandshake) {
        if (sttConnState != SttConnState.CONNECTING) {
          runCatching { close(1000, "stale connection") }
          return
        }
        val cfg = JSONObject()
          .put("type", "config")
          .put("temperature", 0.3)
          .put("top_p", 0.95)
          .put("top_k", 30)
          .put("repetition_penalty", 4)
          .apply {
            if (!sttLanguageCode.equals("auto", ignoreCase = true)) put("language", sttLanguageName)
          }
        runCatching { send(cfg.toString()) }
        appendSentLog("config: ${cfg.toString().take(80)}")
        appendRecvLog("WS opened (${handshake.httpStatus.toInt()} ${handshake.httpStatusMessage})")
        sttConnState = SttConnState.CONNECTED
        if (!startAudioCapture(this)) return
        mainHandler.post {
          if (sttConnState != SttConnState.CONNECTED) return@post
          isSttListening = true
          updateSttViewState()
          startSttPulse()
        }
      }

      override fun onMessage(message: String) {
        if (wsConnection !== this) return
        appendRecvLog(message.take(120))
        val transcript = extractSttTranscript(message) ?: return
        mainHandler.post {
          if (wsConnection !== this) return@post
          val appended = if (sttCapturedText.isBlank()) transcript else "$sttCapturedText $transcript"
          sttCapturedText = appended
          sttLiveText?.text = appended
          val chunk = "$transcript "
          val committed = inputSupplier()?.let { textEngine.commitText(it, chunk) } ?: false
          if (committed) {
            discardTranslationUndo(refreshUi = false)
            sttLastCommitted += chunk
          }
        }
      }

      override fun onMessage(bytes: java.nio.ByteBuffer) {
        appendRecvLog("binary frame ${bytes.remaining()}B")
      }

      override fun onError(ex: Exception) {
        if (wsConnection !== this) return
        Log.w(TAG, "STT WS error", ex)
        appendRecvLog(describeWsFailure(ex))
        failStt(KeyboardErrorCatalog.from(ex), this)
      }

      override fun onClose(code: Int, reason: String, remote: Boolean) {
        if (wsConnection != null && wsConnection !== this) return
        appendRecvLog("CLOSED $code (${if (remote) "remote" else "local"}): $reason")
        finalizeSttDisconnect()
      }
    }

    client.connectionLostTimeout = 0
    if (uri.scheme.equals("wss", ignoreCase = true)) {
      runCatching {
        val sslContext = javax.net.ssl.SSLContext.getInstance("TLS")
        sslContext.init(null, null, null)
        client.setSocketFactory(sslContext.socketFactory)
      }.onFailure { Log.w(TAG, "TLS init failed", it) }
    }

    wsConnection = client
    Thread {
      runCatching { client.connect() }.onFailure {
        Log.w(TAG, "WS connect failed", it)
        appendRecvLog("connect threw: ${it.message}")
        failStt(KeyboardErrorCatalog.from(it), client)
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun failStt(message: String, failed: WebSocketClient) {
    if (wsConnection !== failed) {
      runCatching { failed.close(1000, "stale connection") }
      return
    }
    sttConnState = SttConnState.IDLE
    wsConnection = null
    runCatching { failed.close(1011, "stt failed") }
    val apply = Runnable {
      isSttListening = false
      cancelSttPulse()
      stopAudioCapture()
      showToolbarError(ToolbarErrorSlot.STT, message)
      updateSttViewState()
    }
    if (Looper.myLooper() == Looper.getMainLooper()) apply.run() else mainHandler.post(apply)
  }

  private fun finalizeSttDisconnect() {
    if (sttConnState == SttConnState.IDLE) return
    sttConnState = SttConnState.IDLE
    mainHandler.post {
      isSttListening = false
      cancelSttPulse()
      stopAudioCapture()
      updateSttViewState()
    }
  }

  private fun stopSttListening() {
    if (sttConnState == SttConnState.IDLE || sttConnState == SttConnState.DISCONNECTING) {
      return
    }
    sttConnState = SttConnState.DISCONNECTING
    isSttListening = false
    cancelSttPulse()
    stopAudioCapture()
    runCatching { wsConnection?.send(JSONObject().put("type", "stop").toString()); appendSentLog("stop signal sent") }
    runCatching { wsConnection?.close(1000, "client stop") }
    wsConnection = null
    updateSttViewState()
    mainHandler.postDelayed({
      if (sttConnState == SttConnState.DISCONNECTING) {
        appendRecvLog("close timeout; reset STT connection state")
        finalizeSttDisconnect()
      }
    }, 500L)
  }

  private fun startAudioCapture(ws: WebSocketClient): Boolean {
    val sampleRate = 16000
    val chunkMs = 2000L
    val minBuf = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    val bufSize = maxOf(minBuf, sampleRate * 2)
    val recorder = runCatching {
      AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufSize,
      )
    }.onFailure { Log.w(TAG, "AudioRecord constructor failed", it) }.getOrNull() ?: run {
      failStt(KeyboardErrorCatalog.recordingFailed, ws)
      return false
    }
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      Log.w(TAG, "AudioRecord uninitialized (mic busy or permission missing); aborting")
      appendSentLog("ERROR: mic unavailable (in use or permission denied)")
      runCatching { recorder.release() }
      runCatching { ws.close(1011, "mic unavailable") }
      failStt(KeyboardErrorCatalog.micNeeded, ws)
      return false
    }
    audioRecord = recorder
    val started = runCatching { recorder.startRecording() }
      .onFailure {
        Log.w(TAG, "AudioRecord startRecording failed", it)
        appendSentLog("ERROR: startRecording → ${it.message}")
      }
      .isSuccess
    if (!started) {
      runCatching { recorder.release() }
      audioRecord = null
      runCatching { ws.close(1011, "mic unavailable") }
      failStt(KeyboardErrorCatalog.recordingFailed, ws)
      return false
    }
    appendSentLog("AudioRecord started (${sampleRate}Hz mono PCM16)")

    var chunkCount = 0
    audioThread = Thread {
      val chunkBytes = (sampleRate * chunkMs / 1000 * 2).toInt()
      val pcm = ByteArray(chunkBytes)
      var pos = 0
      val readBuf = ShortArray(512)
      while (!Thread.currentThread().isInterrupted &&
        recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING
      ) {
        val read = recorder.read(readBuf, 0, readBuf.size)
        if (read <= 0) continue
        for (i in 0 until read) {
          val s = readBuf[i].toInt()
          if (pos + 1 >= chunkBytes) {
            val wavBytes = buildWavBytes(pcm, pos, sampleRate)
            runCatching { ws.send(wavBytes) }
            chunkCount++
            appendSentLog("audio chunk #$chunkCount (${wavBytes.size}B WAV, ${pos / 2} samples)")
            pos = 0
          }
          pcm[pos++] = (s and 0xff).toByte()
          pcm[pos++] = ((s shr 8) and 0xff).toByte()
        }
      }
      if (pos > 1) {
        val wavBytes = buildWavBytes(pcm, pos, sampleRate)
        runCatching { ws.send(wavBytes) }
        chunkCount++
        appendSentLog("audio chunk #$chunkCount final (${wavBytes.size}B WAV)")
      }
    }.also { it.isDaemon = true; it.start() }
    return true
  }

  private fun stopAudioCapture() {
    audioThread?.interrupt()
    audioThread = null
    runCatching { audioRecord?.stop() }
    runCatching { audioRecord?.release() }
    audioRecord = null
  }

  private fun buildWavBytes(pcm: ByteArray, pcmLen: Int, sampleRate: Int): ByteArray {
    val dataLen = pcmLen
    val totalLen = dataLen + 36
    val byteRate = sampleRate * 2
    val out = ByteArray(44 + dataLen)
    fun int32le(v: Int, off: Int) {
      out[off] = (v and 0xff).toByte()
      out[off + 1] = ((v shr 8) and 0xff).toByte()
      out[off + 2] = ((v shr 16) and 0xff).toByte()
      out[off + 3] = ((v shr 24) and 0xff).toByte()
    }
    fun int16le(v: Int, off: Int) {
      out[off] = (v and 0xff).toByte()
      out[off + 1] = ((v shr 8) and 0xff).toByte()
    }
    out[0] = 'R'.code.toByte(); out[1] = 'I'.code.toByte()
    out[2] = 'F'.code.toByte(); out[3] = 'F'.code.toByte()
    int32le(totalLen, 4)
    out[8] = 'W'.code.toByte(); out[9] = 'A'.code.toByte()
    out[10] = 'V'.code.toByte(); out[11] = 'E'.code.toByte()
    out[12] = 'f'.code.toByte(); out[13] = 'm'.code.toByte()
    out[14] = 't'.code.toByte(); out[15] = ' '.code.toByte()
    int32le(16, 16)
    int16le(1, 20)
    int16le(1, 22)
    int32le(sampleRate, 24)
    int32le(byteRate, 28)
    int16le(2, 32)
    int16le(16, 34)
    out[36] = 'd'.code.toByte(); out[37] = 'a'.code.toByte()
    out[38] = 't'.code.toByte(); out[39] = 'a'.code.toByte()
    int32le(dataLen, 40)
    pcm.copyInto(out, 44, 0, dataLen)
    return out
  }

  private fun appendSentLog(entry: String) {
    val ts = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US).format(java.util.Date())
    sttSentLog.add("[$ts] $entry")
    if (sttSentLog.size > 200) sttSentLog.removeAt(0)
    mainHandler.post {
      sttSentLogView?.text = sttSentLog.takeLast(60).joinToString("\n")
    }
  }

  private fun appendRecvLog(entry: String) {
    val ts = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US).format(java.util.Date())
    sttRecvLog.add("[$ts] $entry")
    if (sttRecvLog.size > 200) sttRecvLog.removeAt(0)
    mainHandler.post {
      sttRecvLogView?.text = sttRecvLog.takeLast(60).joinToString("\n")
    }
  }

  private fun describeWsFailure(t: Throwable): String {
    val kind = when (t) {
      is java.net.UnknownHostException -> "DNS"
      is java.net.SocketTimeoutException -> "TIMEOUT"
      is javax.net.ssl.SSLException -> "TLS"
      is java.net.ConnectException -> "CONNECT"
      is java.io.EOFException -> "EOF"
      is java.net.ProtocolException -> "UPGRADE"
      else -> t.javaClass.simpleName.ifBlank { "ERROR" }
    }

    val responseInfo: String? = null

    return buildString {
      append("ERROR[$kind]")
      val message = t.message?.takeIf { it.isNotBlank() }
      if (message != null) {
        append(": ")
        append(message)
      }
      if (responseInfo != null) {
        append(" | ")
        append(responseInfo)
      }
    }
  }

  private fun extractSttTranscript(json: String): String? {
    val obj = runCatching { JSONObject(json) }.getOrNull() ?: return null
    return (obj.optString("text").takeIf { it.isNotBlank() }
      ?: obj.optString("transcript").takeIf { it.isNotBlank() }
      ?: obj.optJSONObject("channel")
        ?.optJSONArray("alternatives")
        ?.optJSONObject(0)
        ?.optString("transcript")
        ?.takeIf { it.isNotBlank() })
  }

  private fun updateSttButtonState() {
    val btn = sttMicButton ?: return
    val accent = color("accent", "#3B82F6")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    btn.background = roundedBg(if (isSttListening) accent else keyBg, 999f)
    btn.setColorFilter(if (isSttListening) Color.WHITE else label)
  }

  private fun updateSttViewState() {
    updateSttButtonState()
    val accent = color("accent", "#3B82F6")
    val keyBg = color("key", "#2C2C31")
    val fg = color("label", "#EAEAEE")
    sttLiveMicBtn?.let { micBtn ->
      micBtn.background = roundedBg(if (isSttListening) accent else keyBg, 999f)
      (micBtn.getChildAt(0) as? ImageView)?.apply {
        setImageResource(if (isSttListening) R.drawable.ic_audio_stop else R.drawable.ic_audio_mic)
        setColorFilter(if (isSttListening) Color.WHITE else fg)
        contentDescription = if (isSttListening) "Stop voice input" else "Start voice input"
      }
    }
    val error = toolbarError(ToolbarErrorSlot.STT)
    if (
      !error.isNullOrBlank() &&
        sttConnState == SttConnState.IDLE &&
        !isSttListening
    ) {
      bindSttLiveError(error)
      return
    }
    if (!isSttListening && sttCapturedText.isBlank()) {
      sttLiveText?.text = "Tap the mic to speak"
    }
  }

  private fun clearSttLiveError() {
    clearToolbarError(ToolbarErrorSlot.STT)
    sttLiveText?.apply {
      setTextColor(color("label", "#EAEAEE"))
      isClickable = false
      isFocusable = false
      setOnTouchListener(null)
    }
  }

  private fun bindSttLiveError(message: String): Boolean {
    val live = sttLiveText ?: return false
    live.text = "⚠ $message"
    live.setTextColor(Color.parseColor(TOOLBAR_ERROR_COLOR))
    live.isClickable = true
    live.isFocusable = true
    live.setOnTouchListener(TapTouch { dismissToolbarError(ToolbarErrorSlot.STT) })
    return true
  }

  private fun cancelSttAutoStart() {
    sttShouldAutoStart = false
    mainHandler.removeCallbacks(startSttListeningRunnable)
  }

  private fun startSttPulse() {
    val btn = sttLiveMicBtn ?: return
    val r = object : Runnable {
      var growing = true
      override fun run() {
        val target = if (growing) 1.12f else 1f
        growing = !growing
        btn.animate().scaleX(target).scaleY(target).setDuration(500).start()
        sttPulseRunnable = this
        mainHandler.postDelayed(this, 500)
      }
    }
    sttPulseRunnable = r
    mainHandler.post(r)
  }

  private fun cancelSttPulse() {
    sttPulseRunnable?.let { mainHandler.removeCallbacks(it) }
    sttPulseRunnable = null
    sttLiveMicBtn?.animate()?.scaleX(1f)?.scaleY(1f)?.setDuration(200)?.start()
  }

  private fun buildSttView(): LinearLayout {
    val surface = color("surface", "#121214")
    val toolbar = color("toolbar", "#18181B")
    val keyBg = color("key", "#2C2C31")
    val label = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val muted = Color.parseColor("#71717A")

    return LinearLayout(context).apply {
      orientation = VERTICAL
      setBackgroundColor(surface)
      layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, keyboardHeightPx)

      addView(LinearLayout(context).apply {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(toolbar)
        setPadding(dp(8), dp(6), dp(8), dp(6))
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

        addView(ImageView(context).apply {
          setImageResource(R.drawable.ic_audio_back)
          setColorFilter(label)
          contentDescription = "Back"
          scaleType = ImageView.ScaleType.CENTER_INSIDE
          background = roundedBg(keyBg, 999f)
          val inset = dp(8)
          setPadding(inset, inset, inset, inset)
          layoutParams = LayoutParams(dp(34), dp(34)).apply { marginEnd = dp(6) }
          setOnTouchListener(TapTouch {
            stopSttListening()
            abortSttRecording()
            cancelSttAutoStart()
            featureMode = FeatureMode.KEYBOARD
            mainHandler.post { rebuild() }
          })
        })

        addView(TextView(context).apply {
          text = "Voice Input"
          setTextColor(label)
          textSize = fontSize.coerceAtLeast(13f)
          typeface = keyTypeface
          gravity = Gravity.CENTER_VERTICAL
          layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
        })

        addView(TextView(context).apply {
          text = "DBG"
          setTextColor(if (sttDebugMode) Color.BLACK else muted)
          textSize = 9f
          typeface = keyTypeface
          gravity = Gravity.CENTER
          background = roundedBg(if (sttDebugMode) accent else keyBg, 6f)
          setPadding(dp(5), dp(3), dp(5), dp(3))
          layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            marginEnd = dp(6)
          }
          setOnTouchListener(TapTouch {
            sttDebugMode = !sttDebugMode
            mainHandler.post { rebuild() }
          })
        })

        addView(ImageView(context).apply {
          setImageResource(R.drawable.ic_key_backspace)
          setColorFilter(if (sttLastCommitted.isNotBlank()) label else muted)
          contentDescription = "Undo"
          scaleType = ImageView.ScaleType.CENTER_INSIDE
          background = roundedBg(keyBg, 999f)
          val inset = dp(8)
          setPadding(inset, inset, inset, inset)
          layoutParams = LayoutParams(dp(34), dp(34)).apply { marginStart = dp(6) }
          setOnTouchListener(TapTouch {
            if (sttLastCommitted.isNotBlank()) {
              val input = inputSupplier()
              val before = input?.getTextBeforeCursor(sttLastCommitted.length, 0)?.toString()
              if (before == sttLastCommitted) {
                input?.let { textEngine.replaceSurroundingText(it, sttLastCommitted.length, 0, "") }
              }
              sttLastCommitted = ""
              sttCapturedText = ""
              sttLiveText?.text = "Tap the mic to speak"
              setColorFilter(muted)
            }
          })
        })
      })

      if (!sttDebugMode) {
        addView(FrameLayout(context).apply {
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          setBackgroundColor(surface)
          val liveText = TextView(context).apply {
            val error = toolbarError(ToolbarErrorSlot.STT)
            text = when {
              !error.isNullOrBlank() -> "⚠ $error"
              sttCapturedText.isNotBlank() -> sttCapturedText
              else -> "Tap the mic to speak"
            }
            setTextColor(
              when {
                !error.isNullOrBlank() -> Color.parseColor(TOOLBAR_ERROR_COLOR)
                sttCapturedText.isNotBlank() -> label
                else -> muted
              },
            )
            textSize = (fontSize + 3f).coerceAtLeast(16f)
            typeface = keyTypeface
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(12), dp(24), dp(12))
            layoutParams = FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
            if (!error.isNullOrBlank()) {
              isClickable = true
              isFocusable = true
              setOnTouchListener(TapTouch { dismissToolbarError(ToolbarErrorSlot.STT) })
            }
          }
          sttLiveText = liveText
          addView(liveText)
        })
      } else {
        addView(LinearLayout(context).apply {
          orientation = HORIZONTAL
          layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
          setBackgroundColor(surface)

          fun logPane(title: String, bgTint: Int): Pair<LinearLayout, TextView> {
            val pane = LinearLayout(context).apply {
              orientation = VERTICAL
              layoutParams = LayoutParams(0, LayoutParams.MATCH_PARENT, 1f)
              setBackgroundColor(bgTint)
              setPadding(dp(6), dp(4), dp(6), dp(4))
            }
            val header = TextView(context).apply {
              text = title
              setTextColor(muted)
              textSize = 9f
              typeface = keyTypeface
              setPadding(0, 0, 0, dp(2))
            }
            val scrollLp = LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f)
            val scroll = ScrollView(context).apply {
              isVerticalScrollBarEnabled = true
            }
            val body = TextView(context).apply {
              text = ""
              setTextColor(label)
              textSize = 9f
              typeface = Typeface.MONOSPACE
            }
            scroll.addView(body, android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
            pane.addView(header)
            pane.addView(scroll, scrollLp)
            return pane to body
          }

          val sentBg = Color.argb(30, 59, 130, 246)
          val recvBg = Color.argb(30, 34, 197, 94)
          val (sentPane, sentBody) = logPane("↑ SENT", sentBg)
          val (recvPane, recvBody) = logPane("↓ RECEIVED", recvBg)

          sentBody.text = sttSentLog.takeLast(60).joinToString("\n")
          recvBody.text = sttRecvLog.takeLast(60).joinToString("\n")
          sttSentLogView = sentBody
          sttRecvLogView = recvBody

          addView(sentPane)
          addView(View(context).apply {
            layoutParams = LayoutParams(dp(1), LayoutParams.MATCH_PARENT)
            setBackgroundColor(Color.parseColor("#2C2C31"))
          })
          addView(recvPane)
        })
      }

      addView(LinearLayout(context).apply {
        orientation = VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(16), dp(12), dp(16), dp(16))
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

        val micBg = if (isSttListening) accent else keyBg
        val micFg = if (isSttListening) Color.WHITE else label

        val micFrame = FrameLayout(context).apply {
          background = roundedBg(micBg, 999f)
          layoutParams = LayoutParams(dp(58), dp(58))
          elevation = dp(4).toFloat()
          addView(ImageView(context).apply {
            setImageResource(if (isSttListening) R.drawable.ic_audio_stop else R.drawable.ic_audio_mic)
            setColorFilter(micFg)
            contentDescription = if (isSttListening) "Stop voice input" else "Start voice input"
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            val inset = dp(14)
            setPadding(inset, inset, inset, inset)
            layoutParams = FrameLayout.LayoutParams(
              FrameLayout.LayoutParams.MATCH_PARENT,
              FrameLayout.LayoutParams.MATCH_PARENT,
            )
          })
          setOnTouchListener(TapTouch { startSttListening() })
        }
        sttLiveMicBtn = micFrame
        addView(micFrame)

        addView(TextView(context).apply {
          text = if (isSttListening) "Listening…  tap to stop" else "Tap to speak"
          setTextColor(muted)
          textSize = (fontSize - 3f).coerceAtLeast(10f)
          typeface = keyTypeface
          gravity = Gravity.CENTER
          layoutParams = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(6)
          }
        })
      })

    }
  }

  private fun sttMicIcon(): ImageView {
    val keyBg = color("key", "#2C2C31")
    val accent = color("accent", "#3B82F6")
    val label = color("label", "#EAEAEE")
    val btn = ImageView(context).apply {
      setImageResource(R.drawable.ic_audio_mic)
      setColorFilter(if (isSttListening) Color.WHITE else label)
      contentDescription = "Voice input"
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      background = roundedBg(if (isSttListening) accent else keyBg, 999f)
      val inset = dp(7)
      setPadding(inset, inset, inset, inset)
      layoutParams = LayoutParams(dp(30), dp(30)).apply {
        marginEnd = dp(6)
      }
      setOnTouchListener(TapTouch { activateTool(KeyboardTool.VOICE) })
    }
    sttMicButton = btn
    return btn
  }

  private fun ttsIcon(): FrameLayout {
    val fg = color("label", "#EAEAEE")
    val keyBg = color("key", "#2C2C31")
    val accent = color("accent", "#3B82F6")

    val icon = ImageView(context).apply {
      setImageResource(R.drawable.ic_mode_audio)
      setColorFilter(if (hasActiveTtsState()) Color.WHITE else fg)
      contentDescription = "Text to speech"
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      alpha = 1f
      visibility = if (isTtsLoading) View.INVISIBLE else View.VISIBLE
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    }
    ttsButton = icon

    val spinner = android.widget.ProgressBar(context).apply {
      isIndeterminate = true
      indeterminateTintList = android.content.res.ColorStateList.valueOf(fg)
      visibility = if (isTtsLoading) View.VISIBLE else View.GONE
      layoutParams = FrameLayout.LayoutParams(dp(16), dp(16), android.view.Gravity.CENTER)
    }
    ttsSpinner = spinner

    val container = FrameLayout(context).apply {
      background = roundedBg(if (hasActiveTtsState()) accent else keyBg, 999f)
      alpha = 1f
      val inset = dp(7)
      setPadding(inset, inset, inset, inset)
      layoutParams = LayoutParams(dp(30), dp(30)).apply { marginEnd = dp(6) }
      addView(icon)
      addView(spinner)
      if (!isTtsLoading) {
        setOnTouchListener(TapTouch { activateTool(KeyboardTool.SPEAK) })
      }
    }
    ttsContainer = container
    return container
  }

  private fun updateTtsButtonState() {
    val fg = color("label", "#EAEAEE")
    val accent = color("accent", "#3B82F6")
    val keyBg = color("key", "#2C2C31")

    ttsButton?.setColorFilter(if (hasActiveTtsState()) Color.WHITE else fg)
    ttsButton?.alpha = 1f
    ttsButton?.visibility = if (isTtsLoading) View.INVISIBLE else View.VISIBLE
    ttsSpinner?.visibility = if (isTtsLoading) View.VISIBLE else View.GONE
    ttsContainer?.background = roundedBg(if (hasActiveTtsState()) accent else keyBg, 999f)
    ttsContainer?.alpha = 1f
    ttsContainer?.setOnTouchListener(
      if (!isTtsLoading) TapTouch { openTtsModeFromToolbar() } else null
    )
  }

  private fun hasActiveTtsState(): Boolean =
    featureMode == FeatureMode.TTS || isTtsPlaying || isTtsLoading || isTtsPaused || hasShareableTts()

  private fun openTtsModeFromToolbar() {
    featureMode = FeatureMode.TTS
    rebuild()
  }

  private fun ttsLanguageName(): String =
    KeyboardLanguageCatalog.languageName(ttsLanguageCode)

  private fun syncTtsSelectionsToModel(persist: Boolean) {
    val available = ttsLanguagesForModel()
    if (available.isEmpty()) return

    val normalized = KeyboardLanguageCatalog.canonicalCode(ttsLanguageCode)
    val matched =
      available.firstOrNull { it.code.equals(normalized, ignoreCase = true) }
        ?: available.firstOrNull { it.code.equals("en", ignoreCase = true) }
        ?: available.first()
    if (!matched.code.equals(ttsLanguageCode, ignoreCase = true)) {
      ttsLanguageCode = matched.code
      if (persist) persistTtsSetting("ttsLanguage", matched.code)
    }

    val resolvedVoice = resolvedTtsVoice()
    if (resolvedVoice.isNotBlank() && !resolvedVoice.equals(ttsVoice, ignoreCase = true)) {
      ttsVoice = resolvedVoice
      if (persist) persistTtsSetting("voice", resolvedVoice)
    }
  }

  private fun resolvedTtsServiceModel(): KeyboardLanguageCatalog.ServiceModelSelection =
    KeyboardLanguageCatalog.resolveTts(ttsProvider, ttsModel)

  private fun ttsLanguagesForModel(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.ttsLanguages(resolvedTtsServiceModel().model)

  private fun ttsVoicesForLanguage(): List<String> =
    KeyboardLanguageCatalog.ttsVoices(ttsLanguageCode, resolvedTtsServiceModel().model)

  private fun resolvedTtsVoice(language: String? = null): String {
    val languageCode =
      language?.let { name ->
        KeyboardLanguageCatalog.languageByName(name)?.code
          ?: KeyboardLanguageCatalog.canonicalCode(name)
      } ?: ttsLanguageCode
    val voices = KeyboardLanguageCatalog.ttsVoices(languageCode, resolvedTtsServiceModel().model)
    voices.firstOrNull { it.equals(ttsVoice, ignoreCase = true) }?.let { return it }
    return voices.firstOrNull().orEmpty()
  }

  private fun setTtsLanguage(code: String) {
    val normalized = KeyboardLanguageCatalog.canonicalCode(code)
    val resolved =
      ttsLanguagesForModel().firstOrNull { it.code.equals(normalized, ignoreCase = true) }
        ?: return
    ttsLanguageCode = resolved.code
    persistTtsSetting("ttsLanguage", resolved.code)
    ttsVoicesForLanguage().firstOrNull()?.let { setTtsVoice(it) }
  }

  private fun setTtsVoice(voice: String) {
    val trimmed = voice.trim()
    if (trimmed.isEmpty()) return
    val resolved =
      ttsVoicesForLanguage().firstOrNull { it.equals(trimmed, ignoreCase = true) }
        ?: return
    ttsVoice = resolved
    persistTtsSetting("voice", resolved)
  }

  private fun sttLanguagesForModel(): List<TranslationLanguage> =
    KeyboardLanguageCatalog.sttLanguages(sttModel)

  private fun setSttLanguage(code: String, name: String) {
    sttLanguageCode = KeyboardLanguageCatalog.canonicalCode(code).ifEmpty { "auto" }
    sttLanguageName = name.trim().ifEmpty { KeyboardLanguageCatalog.autoDetect.name }
  }

  private fun persistTtsSetting(key: String, value: String) {
    runCatching {
      val settings =
        runCatching { JSONObject(themeJson) }
          .getOrElse { JSONObject(HypaKeyboardStore.defaultSettingsJson()) }
      settings.put(key, value)
      val updated = settings.toString()
      themeJson = updated
      HypaKeyboardStore.setSettingsJson(context, updated)
    }.onFailure { Log.w(TAG, "Failed to persist $key", it) }
  }

  private sealed class DictionaryAudioPayload {
    data class Bytes(
      val data: ByteArray,
    ) : DictionaryAudioPayload()

    data class Url(
      val url: String,
    ) : DictionaryAudioPayload()
  }

  private fun parseDictionaryAudioPayload(body: String): DictionaryAudioPayload? {
    val trimmed = body.trim()
    if (trimmed.isBlank()) return null

    val json = runCatching { JSONObject(trimmed) }.getOrNull()
    if (json != null) {
      parseDictionaryAudioPayload(json.optString("audio_url").trim())?.let { return it }
      parseDictionaryAudioPayload(json.optString("audio_b64").trim())?.let { return it }
      val response = json.optJSONObject("response")
      if (response != null) {
        parseDictionaryAudioPayload(response.optString("audio_url").trim())?.let { return it }
        parseDictionaryAudioPayload(response.optString("audio_b64").trim())?.let { return it }
      }
      val data = json.optJSONObject("data")
      if (data != null) {
        parseDictionaryAudioPayload(data.optString("audio_url").trim())?.let { return it }
        parseDictionaryAudioPayload(data.optString("audio_b64").trim())?.let { return it }
      }
      return null
    }

    if (trimmed.startsWith("data:")) {
      val commaIndex = trimmed.indexOf(',')
      if (commaIndex > 0) {
        val encoded = trimmed.substring(commaIndex + 1)
        runCatching {
          android.util.Base64.decode(encoded, android.util.Base64.DEFAULT)
        }.getOrNull()?.let { return DictionaryAudioPayload.Bytes(it) }
      }
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return DictionaryAudioPayload.Url(trimmed)
    }

    runCatching {
      android.util.Base64.decode(trimmed, android.util.Base64.DEFAULT)
    }.getOrNull()?.let { return DictionaryAudioPayload.Bytes(it) }

    return null
  }

  private fun speakDictionaryText(
    text: String,
    language: String,
    identifier: String,
  ) {
    if (isTtsLoading) return
    if (isTtsPlaying) {
      stopTts()
      return
    }

    val normalizedText = cleanDictionarySpeechText(text)
    if (normalizedText.isBlank()) return

    syncTtsSelectionsToModel(persist = true)
    val serviceModel = resolvedTtsServiceModel()
    val voice = resolvedTtsVoice(language)
    if (voice.isBlank()) {
      Log.w(TAG, "DictionaryTTS skipped: no voice for ${serviceModel.model}/$language")
      showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.noVoice)
      return
    }

    isTtsLoading = true
    activeDictionarySpeechIdentifier = identifier
    val requestId = ++ttsRequestId
    refreshTtsUi()

    val body = JSONObject()
      .put("text", normalizedText)
      .put("voice", voice)
      .put(
        "preset",
        JSONObject()
          .put("provider", serviceModel.provider)
          .put("model", serviceModel.model)
          .put("language", language),
      )
      .toString()

    val request = Request.Builder()
      .url(HypaApi.url("/dictionary/tts"))
      .addHeader("Accept", HypaApi.JSON_UTF8)
      .apply {
        if (apiToken.isNotBlank()) {
          addHeader("Authorization", "Bearer $apiToken")
        }
      }
      .post(body.toRequestBody(HypaApi.JSON_UTF8.toMediaType()))
      .build()

    Thread {
      runCatching {
        val response = ttsHttpClient.newCall(request).execute()
        val bodyStr = response.body?.string().orEmpty()
        HypaApi.logResponse("DictionaryTTS", response.code, bodyStr)
        if (!response.isSuccessful) {
          throw KeyboardRequestException(response.code, body = bodyStr)
        }

        val payload = parseDictionaryAudioPayload(bodyStr)
          ?: throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noAudio)

        when (payload) {
          is DictionaryAudioPayload.Bytes -> {
            playDictionaryAudio(payload.data, requestId)
          }
          is DictionaryAudioPayload.Url -> {
            fetchAndPlayDictionaryAudio(payload.url, requestId)
          }
        }
      }.onFailure {
        Log.w(TAG, "Dictionary TTS request failed", it)
        mainHandler.post {
          if (requestId != ttsRequestId) return@post
          isTtsLoading = false
          isTtsPlaying = false
          activeDictionarySpeechIdentifier = null
          showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.from(it))
        }
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun fetchAndPlayDictionaryAudio(url: String, requestId: Int) {
    Thread {
      runCatching {
        val response = ttsHttpClient.newCall(Request.Builder().url(url).get().build()).execute()
        if (!response.isSuccessful) {
          throw KeyboardRequestException(response.code)
        }
        val audioBytes = response.body?.bytes()
          ?: throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noAudio)
        playDictionaryAudio(audioBytes, requestId)
      }.onFailure {
        Log.w(TAG, "Dictionary audio fetch failed", it)
        mainHandler.post {
          if (requestId != ttsRequestId) return@post
          isTtsLoading = false
          isTtsPlaying = false
          activeDictionarySpeechIdentifier = null
          showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.from(it))
        }
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun playDictionaryAudio(audioBytes: ByteArray, requestId: Int) {
    val tmp = java.io.File.createTempFile("dictionary_tts_", ".wav", context.cacheDir)
    tmp.writeBytes(audioBytes)
    mainHandler.post {
      if (requestId != ttsRequestId) {
        runCatching { tmp.delete() }
        return@post
      }
      runCatching {
        ttsPlayer?.release()
        isTtsLoading = false
        isTtsPlaying = true
        refreshTtsUi()
        ttsPlayer = MediaPlayer().apply {
          setDataSource(tmp.absolutePath)
          setOnCompletionListener {
            isTtsPlaying = false
            activeDictionarySpeechIdentifier = null
            refreshTtsUi()
            runCatching { tmp.delete() }
            ttsPlayer = null
          }
          setOnErrorListener { _, _, _ ->
            isTtsPlaying = false
            activeDictionarySpeechIdentifier = null
            showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.playbackFailed)
            runCatching { tmp.delete() }
            ttsPlayer = null
            true
          }
          prepare()
          start()
        }
      }.onFailure {
        Log.w(TAG, "Dictionary audio playback failed", it)
        isTtsLoading = false
        isTtsPlaying = false
        activeDictionarySpeechIdentifier = null
        showToolbarError(ToolbarErrorSlot.DICTIONARY, KeyboardErrorCatalog.playbackFailed)
        runCatching { tmp.delete() }
      }
    }
  }

  private fun fullEditorText(input: InputConnection): String {
    val selected = input.getSelectedText(0)?.toString()?.trim().orEmpty()
    if (selected.isNotEmpty()) return selected

    val request = ExtractedTextRequest().apply { hintMaxChars = MAX_EDITOR_TEXT_CHARS }
    val extracted = input.getExtractedText(request, 0)?.text?.toString()?.trim().orEmpty()

    val before = input.getTextBeforeCursor(MAX_EDITOR_TEXT_CHARS, 0)?.toString().orEmpty()
    val after = input.getTextAfterCursor(MAX_EDITOR_TEXT_CHARS, 0)?.toString().orEmpty()
    val aroundCursor = (before + after).trim()

    return if (aroundCursor.length > extracted.length) aroundCursor else extracted
  }

  private fun startTts(
    overrideText: String? = null,
    overrideLanguageName: String? = null,
    restart: Boolean = false,
  ) {
    if (restart) {
      stopTts()
    } else {
      if (isTtsLoading) return
      if (isTtsPlaying) { stopTts(); return }
    }

    val text = if (overrideText != null) {
      overrideText.trim()
    } else {
      val currentText = runCatching {
        inputSupplier()?.let { fullEditorText(it) }.orEmpty()
      }.getOrDefault("")
      currentText.ifBlank { lastFailedTtsText }
    }
    if (text.isBlank()) {
      showToolbarError(ToolbarErrorSlot.TTS, KeyboardErrorCatalog.typeOrSelectText)
      return
    }

    if (overrideLanguageName == null) syncTtsSelectionsToModel(persist = true)
    val serviceModel = resolvedTtsServiceModel()
    val languageName = overrideLanguageName ?: ttsLanguageName()
    val voice = resolvedTtsVoice(overrideLanguageName)
    if (voice.isBlank()) {
      Log.w(TAG, "TTS skipped: no voice for ${serviceModel.model}/$languageName")
      showToolbarError(ToolbarErrorSlot.TTS, KeyboardErrorCatalog.noVoice)
      return
    }

    lastFailedTtsText = text
    isTtsLoading = true
    isTtsPaused = false
    activeDictionarySpeechIdentifier = null
    val requestId = ++ttsRequestId
    refreshTtsUi()

    val body = JSONObject()
      .put("provider", serviceModel.provider)
      .put("model", serviceModel.model)
      .put("voice", voice)
      .put("top_p", 0.4)
      .put("temperature", 0.6)
      .put("repetition_penalty", 2.0)
      .put("max_tokens", 2048)
      .put("language", languageName)
      .put("text", text)
      .toString()

    val request = Request.Builder()
      .url(HypaApi.url("/v2/translate/tts"))
      .addHeader("Accept", HypaApi.JSON_UTF8)
      .apply {
        if (apiToken.isNotBlank()) {
          addHeader("Authorization", "Bearer $apiToken")
        }
      }
      .post(body.toRequestBody(HypaApi.JSON_UTF8.toMediaType()))
      .build()

    Thread {
      fun failTts(message: String) {
        mainHandler.post {
          if (requestId != ttsRequestId) return@post
          isTtsLoading = false
          isTtsPlaying = false
          isTtsPaused = false
          showToolbarError(ToolbarErrorSlot.TTS, message)
        }
      }

      runCatching {
        HypaApi.logRequest("TTS", request.url)
        val response = ttsHttpClient.newCall(request).execute()
        val bodyStr = response.body?.string()
        HypaApi.logResponse("TTS", response.code, bodyStr)
        if (!response.isSuccessful || bodyStr == null) {
          Log.w(TAG, "TTS response error: ${response.code} $bodyStr")
          failTts(KeyboardErrorCatalog.http(response.code, bodyStr))
          return@runCatching
        }
        if (HypaApi.isInvalidGeneratedText(bodyStr)) {
          Log.w(TAG, "TTS invalid generated response: $bodyStr")
          failTts(KeyboardErrorCatalog.noAudio)
          return@runCatching
        }
        val b64 = runCatching {
          JSONObject(bodyStr).getJSONObject("response").getString("audio_b64")
        }.getOrNull()
        if (b64.isNullOrBlank()) {
          Log.w(TAG, "TTS: missing audio_b64 in response: $bodyStr")
          failTts(KeyboardErrorCatalog.noAudio)
          return@runCatching
        }
        val audioBytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        val tmp = java.io.File.createTempFile("tts_", ".${sniffAudioExtension(audioBytes)}", context.cacheDir)
        tmp.writeBytes(audioBytes)
        mainHandler.post {
          if (requestId != ttsRequestId) {
            runCatching { tmp.delete() }
            return@post
          }
          retainSharedTtsAudio(tmp)
          runCatching {
            ttsPlayer?.release()
            isTtsLoading = false
            isTtsPlaying = true
            isTtsPaused = false
            refreshTtsUi()
            ttsPlayer = MediaPlayer().apply {
              setDataSource(tmp.absolutePath)
              setOnCompletionListener {
                isTtsPlaying = false
                isTtsPaused = false
                refreshTtsUi()
                ttsPlayer = null
              }
              setOnErrorListener { _, _, _ ->
                isTtsPlaying = false
                isTtsPaused = false
                clearSharedTtsAudio(tmp)
                ttsPlayer = null
                showToolbarError(ToolbarErrorSlot.TTS, KeyboardErrorCatalog.playbackFailed)
                true
              }
              prepare()
              start()
              lastFailedTtsText = ""
            }
          }.onFailure {
            isTtsLoading = false
            isTtsPlaying = false
            isTtsPaused = false
            clearSharedTtsAudio(tmp)
            showToolbarError(ToolbarErrorSlot.TTS, KeyboardErrorCatalog.playbackFailed)
          }
        }
      }.onFailure {
        Log.w(TAG, "TTS request failed", it)
        failTts(KeyboardErrorCatalog.from(it))
      }
    }.also { it.isDaemon = true }.start()
  }

  private fun stopTts() {
    ttsRequestId += 1
    isTtsLoading = false
    isTtsPlaying = false
    isTtsPaused = false
    activeDictionarySpeechIdentifier = null
    runCatching { ttsPlayer?.stop() }
    runCatching { ttsPlayer?.release() }
    ttsPlayer = null
    refreshTtsUi()
  }

  private fun pauseTts() {
    if (!isTtsPlaying) return
    runCatching { ttsPlayer?.pause() }
    isTtsPlaying = false
    isTtsPaused = true
    refreshTtsUi()
  }

  private fun resumeTts() {
    val player = ttsPlayer
    if (isTtsPaused && player != null) {
      runCatching { player.start() }
      isTtsPaused = false
      isTtsPlaying = true
      refreshTtsUi()
      return
    }
    replayTtsClip()
  }

  private fun replayTtsClip() {
    val file = lastTtsAudioFile?.takeIf { it.exists() && it.length() > 0L } ?: return
    runCatching {
      ttsPlayer?.release()
      ttsPlayer =
        MediaPlayer().apply {
          setDataSource(file.absolutePath)
          setOnCompletionListener {
            isTtsPlaying = false
            isTtsPaused = false
            refreshTtsUi()
            ttsPlayer = null
          }
          setOnErrorListener { _, _, _ ->
            isTtsPlaying = false
            isTtsPaused = false
            refreshTtsUi()
            ttsPlayer = null
            true
          }
          prepare()
          start()
        }
      isTtsPlaying = true
      isTtsPaused = false
      refreshTtsUi()
    }.onFailure {
      isTtsPlaying = false
      isTtsPaused = false
      refreshTtsUi()
    }
  }

  private fun clearTtsClip() {
    lastTtsAudioFile?.let { clearSharedTtsAudio(it) }
  }

  private fun refreshTtsUi() {
    if (featureMode == FeatureMode.DICTIONARY_RESULT || featureMode == FeatureMode.TTS) {
      rebuild()
    } else {
      updateTtsButtonState()
    }
  }

  private fun retainSharedTtsAudio(file: java.io.File) {
    val previous = lastTtsAudioFile
    if (previous != null && previous.absolutePath != file.absolutePath) {
      runCatching { previous.delete() }
    }
    lastTtsAudioFile = file
  }

  private fun clearSharedTtsAudio(file: java.io.File) {
    runCatching { file.delete() }
    if (lastTtsAudioFile?.absolutePath == file.absolutePath) {
      lastTtsAudioFile = null
    }
  }

  private fun hasShareableTts(): Boolean =
    lastTtsAudioFile?.let { it.exists() && it.length() > 0L } == true

  private fun shareTtsAudio() {
    lastTtsAudioFile?.takeIf { it.exists() && it.length() > 0L }?.let {
      shareAudioFile(it, mimeForAudioExtension(it.extension))
    }
  }

  private fun sniffAudioExtension(bytes: ByteArray): String {
    fun match(offset: Int, vararg sig: Int): Boolean {
      if (bytes.size < offset + sig.size) return false
      for (i in sig.indices) {
        if ((bytes[offset + i].toInt() and 0xFF) != sig[i]) return false
      }
      return true
    }
    return when {
      match(0, 0x52, 0x49, 0x46, 0x46) && match(8, 0x57, 0x41, 0x56, 0x45) -> "wav"
      match(4, 0x66, 0x74, 0x79, 0x70) -> "m4a"
      match(0, 0x4F, 0x67, 0x67, 0x53) -> "ogg"
      match(0, 0x49, 0x44, 0x33) -> "mp3"
      bytes.size >= 2 && (bytes[0].toInt() and 0xFF) == 0xFF &&
        (bytes[1].toInt() and 0xE0) == 0xE0 -> "mp3"
      else -> "mp3"
    }
  }

  private fun mimeForAudioExtension(ext: String): String = when (ext.lowercase()) {
    "m4a", "mp4", "aac" -> "audio/mp4"
    "ogg", "opus" -> "audio/ogg"
    "wav" -> "audio/wav"
    else -> "audio/mpeg"
  }

  private fun hasShareableRecording(): Boolean =
    sttRecordedFile?.let { it.exists() && it.length() > 0L } == true

  private fun shareRecordingAudio() {
    sttRecordedFile?.takeIf { it.exists() && it.length() > 0L }?.let {
      shareAudioFile(it, "audio/mp4")
    }
  }

  private fun shareAudioFile(file: java.io.File, mimeType: String) {
    runCatching {
      val authority = "${context.packageName}.fileprovider"
      val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)
      val sendIntent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(android.content.Intent.EXTRA_STREAM, uri)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = android.content.Intent.createChooser(sendIntent, "Share audio").apply {
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(chooser)
    }.onFailure { Log.w(TAG, "Audio share failed", it) }
  }

  private fun pulse() {
    if (!haptics) return

    val now = SystemClock.uptimeMillis()
    if (now - lastHapticMs < HAPTIC_THROTTLE_MS) return
    lastHapticMs = now

    if (performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)) return

    val vibrator = cachedVibrator ?: return
    if (!vibrator.hasVibrator()) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val effect = cachedVibrationEffect ?: run {
        val durationMs = (8L + (vibrationStrength / 255f * 8f).toLong())
        VibrationEffect.createOneShot(durationMs, vibrationStrength.coerceIn(1, 255))
      }.also { cachedVibrationEffect = it }
      vibrator.vibrate(effect)
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate((8L + vibrationStrength / 32L).coerceIn(8L, 16L))
    }
  }

  private fun prepareKeySound() {
    if (keySoundPool != null) return

    val attributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    keySoundPool =
      SoundPool
        .Builder()
        .setAudioAttributes(attributes)
        .setMaxStreams(6)
        .build()
        .also { pool ->
          pool.setOnLoadCompleteListener { _, sampleId, status ->
            isKeySoundLoaded = status == 0 && sampleId == keySoundId
          }
          keySoundId = pool.load(context, R.raw.key_pop, 1)
        }
  }

  private fun releaseKeySound() {
    runCatching { keySoundPool?.release() }
    keySoundPool = null
    keySoundId = 0
    isKeySoundLoaded = false
  }

  private fun playKeySound() {
    if (!soundEnabled || !isKeySoundLoaded) return
    keySoundPool?.play(keySoundId, 0.32f, 0.32f, 0, 0, 1f)
  }
}
