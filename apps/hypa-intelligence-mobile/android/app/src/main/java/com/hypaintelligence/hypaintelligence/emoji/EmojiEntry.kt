package com.hypaintelligence.hypaintelligence.emoji

data class EmojiEntry(
  val sequence: String,
  val name: String,
  val variants: List<String> = emptyList(),
  val keywords: List<String> = emptyList(),
) {
  val hasVariants: Boolean
    get() = variants.isNotEmpty()
}

data class EmojiGroup(
  val name: String,
  val entries: List<EmojiEntry>,
)
