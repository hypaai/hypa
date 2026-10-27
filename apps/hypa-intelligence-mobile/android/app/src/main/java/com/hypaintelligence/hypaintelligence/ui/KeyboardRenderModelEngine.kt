package com.hypaintelligence.hypaintelligence.ui

import com.hypaintelligence.hypaintelligence.R
import com.hypaintelligence.hypaintelligence.input.KeyboardBoardMode
import com.hypaintelligence.hypaintelligence.input.ReturnAction
import com.hypaintelligence.hypaintelligence.input.KeyboardBoardMode.ALPHABET
import com.hypaintelligence.hypaintelligence.input.KeyboardBoardMode.NUMERIC
import com.hypaintelligence.hypaintelligence.input.KeyboardBoardMode.SYMBOLS

enum class KeyboardRenderAction {
  COMMIT_LETTER,
  COMMIT_SYMBOL,
  OPEN_SYMBOLS,
  TOGGLE_SYMBOL_PAGE,
  RETURN_TO_ALPHABET,
  COMMIT_COMMA,
  COMMIT_PERIOD,
  COMMIT_DOT_COM,
  COMMIT_EMAIL_AWARE_COMMA_OR_AT,
  OPEN_EMOJI,
  SEARCH,
  SHIFT,
  DELETE,
  SPACE,
}

enum class KeyboardRenderKeyType {
  LETTER,
  SYMBOL,
  SPECIAL,
  ACTION,
  SHIFT,
  DELETE,
  SPACE,
  EMOJI,
  SPACER,
}

data class KeyboardRenderKey(
  val type: KeyboardRenderKeyType,
  val action: KeyboardRenderAction,
  val weight: Float,
  val label: String? = null,
  val value: String? = null,
  val hint: String? = null,
  val iconRes: Int? = null,
  val triggerOnDown: Boolean = false,
  val longPressAction: KeyboardRenderAction? = null,
)

data class KeyboardRenderRow(
  val keys: List<KeyboardRenderKey>,
)

data class KeyboardRenderBoard(
  val rows: List<KeyboardRenderRow>,
)

class KeyboardRenderModelEngine(
  private val layoutEngine: KeyboardLayoutEngine,
) {
  fun buildBoard(
    mode: KeyboardBoardMode,
    languageCode: String,
    forceEmail: Boolean,
    wantsDotCom: Boolean,
    returnAction: ReturnAction,
    symbolPage: Int,
  ): KeyboardRenderBoard =
    when (mode) {
      ALPHABET -> buildAlphabetBoard(languageCode, forceEmail, wantsDotCom, returnAction)
      SYMBOLS -> buildSymbolBoard(symbolPage, returnAction)
      NUMERIC -> buildNumericBoard()
    }

  private fun buildAlphabetBoard(
    languageCode: String,
    forceEmail: Boolean,
    wantsDotCom: Boolean,
    returnAction: ReturnAction,
  ): KeyboardRenderBoard {
    val rows = layoutEngine.alphabetLayout(languageCode)
    val row2Indent = (rows.first.size - rows.second.size) / 2f

    return KeyboardRenderBoard(
      rows =
        listOf(
          KeyboardRenderRow(
            rows.first.mapIndexed { index, key ->
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.LETTER,
                action = KeyboardRenderAction.COMMIT_LETTER,
                weight = 1f,
                label = key,
                value = key,
                hint = if (index == 9) "0" else (index + 1).toString(),
              )
            },
          ),
          KeyboardRenderRow(
            buildList {
              if (row2Indent > 0f) {
                add(
                  KeyboardRenderKey(
                    type = KeyboardRenderKeyType.SPACER,
                    action = KeyboardRenderAction.SPACE,
                    weight = row2Indent,
                  ),
                )
              }
              addAll(
                rows.second.map { key ->
                  KeyboardRenderKey(
                    type = KeyboardRenderKeyType.LETTER,
                    action = KeyboardRenderAction.COMMIT_LETTER,
                    weight = 1f,
                    label = key,
                    value = key,
                  )
                },
              )
              if (row2Indent > 0f) {
                add(
                  KeyboardRenderKey(
                    type = KeyboardRenderKeyType.SPACER,
                    action = KeyboardRenderAction.SPACE,
                    weight = row2Indent,
                  ),
                )
              }
            },
          ),
          KeyboardRenderRow(
            buildList {
              add(
                KeyboardRenderKey(
                  type = KeyboardRenderKeyType.SHIFT,
                  action = KeyboardRenderAction.SHIFT,
                  weight = 1.35f,
                ),
              )
              addAll(
                rows.third.map { key ->
                  KeyboardRenderKey(
                    type = KeyboardRenderKeyType.LETTER,
                    action = KeyboardRenderAction.COMMIT_LETTER,
                    weight = 1f,
                    label = key,
                    value = key,
                  )
                },
              )
              add(
                KeyboardRenderKey(
                  type = KeyboardRenderKeyType.DELETE,
                  action = KeyboardRenderAction.DELETE,
                  weight = 1.35f,
                ),
              )
            },
          ),
          KeyboardRenderRow(
            listOf(
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.OPEN_SYMBOLS,
                weight = 1.2f,
                label = "123",
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.COMMIT_EMAIL_AWARE_COMMA_OR_AT,
                weight = 0.9f,
                label = if (forceEmail) "@" else ",",
                triggerOnDown = true,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.EMOJI,
                action = KeyboardRenderAction.OPEN_EMOJI,
                weight = 0.9f,
                iconRes = R.drawable.ic_emoji_smileys,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPACE,
                action = KeyboardRenderAction.SPACE,
                weight = 3.8f,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.COMMIT_PERIOD,
                weight = 0.9f,
                label = ".",
                longPressAction = if (wantsDotCom) KeyboardRenderAction.COMMIT_DOT_COM else null,
                triggerOnDown = !wantsDotCom,
              ),
              returnKey(returnAction),
            ),
          ),
        ),
    )
  }

  private fun buildSymbolBoard(symbolPage: Int, returnAction: ReturnAction): KeyboardRenderBoard {
    val layout = layoutEngine.symbolLayout(symbolPage)
    return KeyboardRenderBoard(
      rows =
        listOf(
          KeyboardRenderRow(
            layout.first.map { symbol ->
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SYMBOL,
                action = KeyboardRenderAction.COMMIT_SYMBOL,
                weight = 1f,
                label = symbol,
                value = symbol,
              )
            },
          ),
          KeyboardRenderRow(
            layout.second.map { symbol ->
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SYMBOL,
                action = KeyboardRenderAction.COMMIT_SYMBOL,
                weight = 1f,
                label = symbol,
                value = symbol,
              )
            },
          ),
          KeyboardRenderRow(
            buildList {
              add(
                KeyboardRenderKey(
                  type = KeyboardRenderKeyType.SPECIAL,
                  action = KeyboardRenderAction.TOGGLE_SYMBOL_PAGE,
                  weight = 1.2f,
                  label = layout.toggleLabel,
                ),
              )
              addAll(
                layout.third.map { symbol ->
                  KeyboardRenderKey(
                    type = KeyboardRenderKeyType.SYMBOL,
                    action = KeyboardRenderAction.COMMIT_SYMBOL,
                    weight = 1f,
                    label = symbol,
                    value = symbol,
                  )
                },
              )
              add(
                KeyboardRenderKey(
                  type = KeyboardRenderKeyType.DELETE,
                  action = KeyboardRenderAction.DELETE,
                  weight = 1.35f,
                ),
              )
            },
          ),
          KeyboardRenderRow(
            listOf(
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.RETURN_TO_ALPHABET,
                weight = 1.2f,
                label = "ABC",
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.COMMIT_COMMA,
                weight = 0.9f,
                label = ",",
                value = ",",
                triggerOnDown = true,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.EMOJI,
                action = KeyboardRenderAction.OPEN_EMOJI,
                weight = 0.9f,
                iconRes = R.drawable.ic_emoji_smileys,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPACE,
                action = KeyboardRenderAction.SPACE,
                weight = 3.2f,
              ),
              KeyboardRenderKey(
                type = KeyboardRenderKeyType.SPECIAL,
                action = KeyboardRenderAction.COMMIT_PERIOD,
                weight = 0.9f,
                label = ".",
                value = ".",
                triggerOnDown = true,
              ),
              returnKey(returnAction),
            ),
          ),
        ),
    )
  }

  private fun buildNumericBoard(): KeyboardRenderBoard {
    val rows = layoutEngine.numericRows()
    return KeyboardRenderBoard(
      rows =
        listOf(
          KeyboardRenderRow(rows[0].map(::symbolKey)),
          KeyboardRenderRow(rows[1].map(::symbolKey)),
          KeyboardRenderRow(rows[2].map(::symbolKey)),
          KeyboardRenderRow(
            buildList {
              addAll(rows[3].map(::symbolKey))
              add(
                KeyboardRenderKey(
                  type = KeyboardRenderKeyType.DELETE,
                  action = KeyboardRenderAction.DELETE,
                  weight = 1.35f,
                ),
              )
            },
          ),
        ),
    )
  }

  private fun symbolKey(symbol: String): KeyboardRenderKey =
    KeyboardRenderKey(
      type = KeyboardRenderKeyType.SYMBOL,
      action = KeyboardRenderAction.COMMIT_SYMBOL,
      weight = 1f,
      label = symbol,
      value = symbol,
    )

  private fun returnKey(returnAction: ReturnAction): KeyboardRenderKey =
    KeyboardRenderKey(
      type = KeyboardRenderKeyType.ACTION,
      action = KeyboardRenderAction.SEARCH,
      weight = 1.4f,
      iconRes =
        when (returnAction) {
          ReturnAction.GO, ReturnAction.SEARCH -> R.drawable.ic_mode_search
          ReturnAction.SEND -> R.drawable.ic_audio_send
          ReturnAction.DONE -> R.drawable.ic_key_check
          ReturnAction.NEXT -> R.drawable.ic_key_arrow_right
          ReturnAction.NEWLINE, ReturnAction.PREVIOUS -> R.drawable.ic_key_done
        },
    )
}
