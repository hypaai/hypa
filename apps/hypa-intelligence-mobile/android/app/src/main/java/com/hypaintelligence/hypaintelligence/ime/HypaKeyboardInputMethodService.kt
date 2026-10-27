package com.hypaintelligence.hypaintelligence.ime

import android.content.ClipboardManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import android.view.inputmethod.EditorInfo
import java.util.concurrent.Executors
import com.hypaintelligence.hypaintelligence.HypaKeyboardPanelView
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import com.hypaintelligence.hypaintelligence.emoji.EmojiCompatBootstrap
import com.hypaintelligence.hypaintelligence.input.insertsNewline
import com.hypaintelligence.hypaintelligence.neural.DeviceCapability
import com.hypaintelligence.hypaintelligence.neural.DeviceTier
import com.hypaintelligence.hypaintelligence.neural.TinyKeysService
import com.hypaintelligence.hypaintelligence.storage.HypaKeyboardClipStore

class HypaKeyboardInputMethodService : InputMethodService() {
  private var panel: HypaKeyboardPanelView? = null
  private var clipboard: ClipboardManager? = null
  private var appliedNavigationBarColor: Int? = null
  private lateinit var tinyKeys: TinyKeysService
  private val modelThread = Executors.newSingleThreadExecutor(KeyboardThreads.compute("hypa-model-load"))
  private val onClipChanged =
    ClipboardManager.OnPrimaryClipChangedListener { HypaKeyboardClipStore.captureCurrentClip(this) }

  override fun onCreate() {
    super.onCreate()
    EmojiCompatBootstrap.initialize(this)
    tinyKeys = TinyKeysService(this)
    clipboard =
      (getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.also {
        it.addPrimaryClipChangedListener(onClipChanged)
      }
  }

  override fun onCreateInputView(): View {
    val p =
      HypaKeyboardPanelView(
        this,
        inputSupplier = { currentInputConnection },
        onSearch = { performSearchAction() },
        onSurfaceColor = ::applyNavigationBarColor,
        tinyKeys = tinyKeys,
      )
    panel = p
    p.bindEditorInfo(currentInputEditorInfo)
    p.bindSelection(-1, -1)
    return p
  }

  override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
    super.onStartInputView(info, restarting)
    HypaKeyboardClipStore.captureCurrentClip(this)
    panel?.refreshSettings()
    panel?.bindEditorInfo(info)
    panel?.resetSessionState(preserveActiveMode = restarting)
    panel?.bindSelection(info?.initialSelStart ?: -1, info?.initialSelEnd ?: -1)
  }

  override fun onWindowShown() {
    super.onWindowShown()
    if (panel?.usesModel == true && DeviceCapability.tier(this) != DeviceTier.LOW) modelThread.execute { tinyKeys.load() }
  }

  override fun onWindowHidden() {
    super.onWindowHidden()
    tinyKeys.cancel()
    modelThread.execute { tinyKeys.unload() }
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= TRIM_MEMORY_RUNNING_LOW) modelThread.execute { tinyKeys.unload() }
  }

  override fun onUpdateSelection(
    oldSelStart: Int,
    oldSelEnd: Int,
    newSelStart: Int,
    newSelEnd: Int,
    candidatesStart: Int,
    candidatesEnd: Int,
  ) {
    super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd)
    panel?.bindSelection(newSelStart, newSelEnd)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    panel?.onDeviceAppearanceChanged()
  }

  override fun onDestroy() {
    clipboard?.removePrimaryClipChangedListener(onClipChanged)
    panel?.shutdownPrediction()
    modelThread.execute { tinyKeys.unload() }
    modelThread.shutdown()
    super.onDestroy()
  }

  private fun applyNavigationBarColor(surface: Int) {
    if (surface == appliedNavigationBarColor) return
    val window = window?.window ?: return
    appliedNavigationBarColor = surface

    @Suppress("DEPRECATION")
    window.navigationBarColor = surface
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val luminance =
        0.299f * Color.red(surface) + 0.587f * Color.green(surface) + 0.114f * Color.blue(surface)
      window.insetsController?.setSystemBarsAppearance(
        if (luminance > 140f) WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS else 0,
        WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
      )
    }
  }

  private fun performSearchAction() {
    val ic = currentInputConnection ?: return
    val info = currentInputEditorInfo ?: return
    if (insertsNewline(info)) {
      ic.commitText("\n", 1)
      return
    }

    val action = info.imeOptions and EditorInfo.IME_MASK_ACTION
    val customAction = info.actionId.takeIf { it != 0 && !info.actionLabel.isNullOrBlank() }
    val did =
      if (customAction != null) {
        ic.performEditorAction(customAction)
      } else when (action) {
        EditorInfo.IME_ACTION_SEARCH,
        EditorInfo.IME_ACTION_GO,
        EditorInfo.IME_ACTION_SEND,
        EditorInfo.IME_ACTION_DONE,
        EditorInfo.IME_ACTION_NEXT,
        EditorInfo.IME_ACTION_PREVIOUS,
        -> ic.performEditorAction(action)
        else -> ic.performEditorAction(EditorInfo.IME_ACTION_DONE)
      }
    if (!did) {
      ic.commitText("\n", 1)
    }
  }
}
