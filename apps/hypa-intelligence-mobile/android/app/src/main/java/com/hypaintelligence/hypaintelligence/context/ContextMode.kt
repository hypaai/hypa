package com.hypaintelligence.hypaintelligence.context

import android.text.InputType
import android.view.inputmethod.EditorInfo

enum class ContextMode {
  NORMAL,
  SEARCH,
  EMAIL,
  URL,
  PASSWORD,
  NUMBER,
  PHONE,
  ALL_CAPS;

  val allowsPrediction: Boolean
    get() = this == NORMAL

  val allowsLearning: Boolean
    get() = this == NORMAL
}

object ContextDetector {
  fun detect(info: EditorInfo?): ContextMode {
    if (info == null) return ContextMode.NORMAL
    val inputType = info.inputType
    val cls = inputType and InputType.TYPE_MASK_CLASS
    val variation = inputType and InputType.TYPE_MASK_VARIATION

    return when (cls) {
      InputType.TYPE_CLASS_NUMBER ->
        if (variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD) ContextMode.PASSWORD
        else ContextMode.NUMBER
      InputType.TYPE_CLASS_PHONE -> ContextMode.PHONE
      InputType.TYPE_CLASS_TEXT ->
        when (variation) {
          InputType.TYPE_TEXT_VARIATION_PASSWORD,
          InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
          InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
          -> ContextMode.PASSWORD
          InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
          InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS,
          -> ContextMode.EMAIL
          InputType.TYPE_TEXT_VARIATION_URI -> ContextMode.URL
          InputType.TYPE_TEXT_VARIATION_FILTER -> ContextMode.SEARCH
          else ->
            if (info.imeOptions and EditorInfo.IME_MASK_ACTION == EditorInfo.IME_ACTION_SEARCH) {
              ContextMode.SEARCH
            } else if (inputType and InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS != 0) {
              ContextMode.ALL_CAPS
            } else {
              ContextMode.NORMAL
            }
        }
      else -> ContextMode.NORMAL
    }
  }
}
