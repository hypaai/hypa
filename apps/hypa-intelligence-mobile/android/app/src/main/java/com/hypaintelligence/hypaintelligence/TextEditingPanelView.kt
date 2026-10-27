package com.hypaintelligence.hypaintelligence

import android.content.Context
import android.graphics.PorterDuff
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.view.ViewGroup
import android.view.ViewGroup.LayoutParams.MATCH_PARENT

class TextEditingPanelView(context: Context, private val panel: HypaKeyboardPanelView) : LinearLayout(context) {

    init {
        orientation = VERTICAL
        layoutParams = LayoutParams(MATCH_PARENT, MATCH_PARENT)
        setPadding(panel.textEditingDp(4), panel.textEditingDp(4), panel.textEditingDp(4), panel.textEditingDp(4))
        build()
    }

    private fun build() {
    val keyBg = panel.textEditingColor("key", "#2C2C31")
    val keyPressed = panel.textEditingColor("keyPressed", "#444444")
    val labelColor = panel.textEditingColor("label", "#FFFFFF")
    val accent = panel.textEditingColor("accent", "#3B82F6")
    val disabledAlpha = 0.4f

    val ic = panel.textEditingInputConnection()
    val document = panel.textEditingSnapshot()
    val hasText = !document?.text.isNullOrEmpty()
    val hasSelection =
      document != null && document.selectionStart != document.selectionEnd
    fun createKey(
      label: String? = null,
      iconRes: Int? = null,
      weight: Float = 1f,
      heightDp: Int = 46,
      enabled: Boolean = true,
      isActive: Boolean = false,
      isRepeatable: Boolean = false,
      activateOnPress: Boolean = false,
      onClick: () -> Unit
    ): View {
      val container = FrameLayout(context).apply {
        layoutParams = LinearLayout.LayoutParams(0, panel.textEditingDp(heightDp), weight).apply {
          setMargins(panel.textEditingDp(2), panel.textEditingDp(2), panel.textEditingDp(2), panel.textEditingDp(2))
        }
        background = GradientDrawable().apply {
          setColor(if (isActive) accent else keyBg)
          cornerRadius = panel.textEditingDp(6).toFloat()
        }
        alpha = if (enabled) 1f else disabledAlpha
      }

      if (label != null) {
        container.addView(
          TextView(context).apply {
            text = label
            setTextColor(labelColor)
            textSize = 14f
          typeface = panel.textEditingTypeface()
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
          }
        )
      } else if (iconRes != null) {
        val iv = ImageView(context).apply {
          setImageResource(iconRes)
          setColorFilter(labelColor, PorterDuff.Mode.SRC_IN)
          layoutParams = FrameLayout.LayoutParams(panel.textEditingDp(24), panel.textEditingDp(24), Gravity.CENTER)
        }
        container.addView(iv)
      }

      if (enabled) {
        if (isRepeatable) {
          var repeatHandler: Handler? = null
          var repeatRunnable: Runnable? = null
          container.setOnTouchListener { v, event ->
            when (event.action) {
              MotionEvent.ACTION_DOWN -> {
                v.background = GradientDrawable().apply { setColor(keyPressed); cornerRadius = panel.textEditingDp(6).toFloat() }
          panel.textEditingPlayKeyFeedback()
                onClick()
                repeatHandler = Handler(Looper.getMainLooper())
                repeatRunnable = object : Runnable {
                  override fun run() {
                    panel.textEditingPlayKeyFeedback()
                    onClick()
                    repeatHandler?.postDelayed(this, 65)
                  }
                }
                repeatHandler?.postDelayed(repeatRunnable!!, 350)
                true
              }
              MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                v.background = GradientDrawable().apply { setColor(if (isActive) accent else keyBg); cornerRadius = panel.textEditingDp(6).toFloat() }
                repeatHandler?.removeCallbacks(repeatRunnable!!)
                true
              }
              else -> false
            }
          }
        } else if (activateOnPress) {
          container.setOnTouchListener { v, event ->
            when (event.actionMasked) {
              MotionEvent.ACTION_DOWN -> {
                v.background = GradientDrawable().apply { setColor(keyPressed); cornerRadius = panel.textEditingDp(6).toFloat() }
                panel.textEditingPlayKeyFeedback()
                onClick()
              }
              MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                v.background = GradientDrawable().apply { setColor(if (isActive) accent else keyBg); cornerRadius = panel.textEditingDp(6).toFloat() }
              }
            }
            true
          }
        } else {
          container.setOnClickListener {
            panel.textEditingPlayKeyFeedback()
            onClick()
          }
          container.setOnTouchListener { v, event ->
            when (event.action) {
              MotionEvent.ACTION_DOWN -> {
                v.background = GradientDrawable().apply { setColor(keyPressed); cornerRadius = panel.textEditingDp(6).toFloat() }
              }
              MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                v.background = GradientDrawable().apply { setColor(if (isActive) accent else keyBg); cornerRadius = panel.textEditingDp(6).toFloat() }
              }
            }
            false
          }
        }
      }
      return container
    }

    val mainRow = LinearLayout(context).apply {
      orientation = HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
    }

    val dpadLeft = createKey(iconRes = R.drawable.ic_audio_back, weight = 1f, heightDp = 150, enabled = hasText, isRepeatable = true) {
      panel.textEditingMove(KeyEvent.KEYCODE_DPAD_LEFT)
    }

    val dpadCenter = LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1.2f)
    }

    val keyUp = createKey(iconRes = R.drawable.ic_audio_back, weight = 1f, heightDp = 46, enabled = hasText, isRepeatable = true) {
      panel.textEditingMove(KeyEvent.KEYCODE_DPAD_UP)
    }
    (keyUp as ViewGroup).getChildAt(0).rotation = 90f

    val keySelect = createKey(label = "Select", weight = 1f, heightDp = 46, enabled = hasText, isActive = panel.textEditingSelectMode(), activateOnPress = true) {
      panel.textEditingToggleSelect()
    }

    val keyDown = createKey(iconRes = R.drawable.ic_audio_back, weight = 1f, heightDp = 46, enabled = hasText, isRepeatable = true) {
      panel.textEditingMove(KeyEvent.KEYCODE_DPAD_DOWN)
    }
    (keyDown as ViewGroup).getChildAt(0).rotation = 270f

    listOf(keyUp, keySelect, keyDown).forEach { key ->
      (key.layoutParams as LinearLayout.LayoutParams).apply {
        width = LayoutParams.MATCH_PARENT
        weight = 0f
      }
      dpadCenter.addView(key)
    }

    val dpadRight = createKey(iconRes = R.drawable.ic_audio_back, weight = 1f, heightDp = 150, enabled = hasText, isRepeatable = true) {
      panel.textEditingMove(KeyEvent.KEYCODE_DPAD_RIGHT)
    }
    (dpadRight as ViewGroup).getChildAt(0).rotation = 180f

    val actionCol = LinearLayout(context).apply {
      orientation = VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1.5f)
    }

    val selectAllOrCutLabel = if (hasSelection) "Cut" else "Select all"
    val keySelectAllCut = createKey(label = selectAllOrCutLabel, weight = 1f, heightDp = 46, enabled = hasText) {
      if (hasSelection) {
        val cutSucceeded =
          panel.textEditingInputConnection()?.performContextMenuAction(android.R.id.cut) == true
        if (cutSucceeded) panel.textEditingFinishSelection()
      } else {
        panel.textEditingSelectAll()
      }
    }

    val keyCopy = createKey(label = "Copy", weight = 1f, heightDp = 46, enabled = hasSelection) {
      panel.textEditingInputConnection()?.performContextMenuAction(android.R.id.copy)
    }

    val keyPaste = createKey(
      label = "Paste", weight = 1f, heightDp = 46,
      enabled = ic != null && panel.textEditingHasClipboardText()
    ) {
      panel.textEditingPasteClipboard()
    }

    listOf(keySelectAllCut, keyCopy, keyPaste).forEach { key ->
      (key.layoutParams as LinearLayout.LayoutParams).apply {
        width = LayoutParams.MATCH_PARENT
        weight = 0f
      }
      actionCol.addView(key)
    }

    mainRow.addView(dpadLeft)
    mainRow.addView(dpadCenter)
    mainRow.addView(dpadRight)
    mainRow.addView(actionCol)

    val bottomRow = LinearLayout(context).apply {
      orientation = HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
    }

    val keyJumpStart = createKey(label = "|<", weight = 1f, heightDp = 46, enabled = hasText) {
      if (panel.textEditingSelectMode()) {
         panel.textEditingSetSelection(document?.selectionEnd ?: 0, 0)
      } else {
         panel.textEditingSetSelection(0, 0)
      }
    }

    val keyJumpEnd = createKey(label = ">|", weight = 1f, heightDp = 46, enabled = hasText) {
      val len = document?.text?.length ?: 0
      if (panel.textEditingSelectMode()) {
         panel.textEditingSetSelection(document?.selectionStart ?: 0, len)
      } else {
         panel.textEditingSetSelection(len, len)
      }
    }

    val keyBackspace = createKey(iconRes = R.drawable.ic_key_backspace, weight = 1f, heightDp = 46, enabled = hasText, isRepeatable = true) {
      panel.textEditingInputConnection()?.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
      panel.textEditingInputConnection()?.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL))
      panel.textEditingFinishSelection()
    }

    bottomRow.addView(keyJumpStart)
    bottomRow.addView(keyJumpEnd)
    bottomRow.addView(keyBackspace)

    addView(mainRow)
    addView(bottomRow)


  }
}
