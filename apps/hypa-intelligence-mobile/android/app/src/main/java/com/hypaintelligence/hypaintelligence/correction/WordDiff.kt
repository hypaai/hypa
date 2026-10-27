package com.hypaintelligence.hypaintelligence.correction

object WordDiff {
  data class Change(val from: List<String>, val to: List<String>)

  fun distance(a: String, b: String): Int {
    val d = Array(a.length + 1) { i -> IntArray(b.length + 1) { j -> if (i == 0) j else if (j == 0) i else 0 } }
    for (i in 1..a.length) {
      for (j in 1..b.length) {
        val cost = if (a[i - 1] == b[j - 1]) 0 else 1
        d[i][j] = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
          d[i][j] = minOf(d[i][j], d[i - 2][j - 2] + 1)
        }
      }
    }
    return d[a.length][b.length]
  }

  fun isSmallFix(change: Change): Boolean =
    change.from.size == change.to.size &&
      change.from.zip(change.to).all { (a, b) ->
        fun letters(word: String) = word.lowercase().filter { it.isLetterOrDigit() || it == '\'' }
        fun marks(word: String) = word.filterNot { it.isLetterOrDigit() || it == '\'' }
        val x = letters(a)
        val y = letters(b)
        marks(a) == marks(b) &&
          (x == y || (x.isNotEmpty() && y.isNotEmpty() && distance(x, y) <= if (x.length < 5) 1 else 2))
      }

  fun words(text: String): List<String> = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }

  fun changes(original: String, corrected: String): List<Change> {
    val a = words(original)
    val b = words(corrected)
    val common = Array(a.size + 1) { IntArray(b.size + 1) }
    for (i in a.indices.reversed()) {
      for (j in b.indices.reversed()) {
        common[i][j] = if (a[i] == b[j]) common[i + 1][j + 1] + 1 else maxOf(common[i + 1][j], common[i][j + 1])
      }
    }

    val changes = ArrayList<Change>()
    val from = ArrayList<String>()
    val to = ArrayList<String>()
    fun flush() {
      if (from.isEmpty() && to.isEmpty()) return
      changes += Change(from.toList(), to.toList())
      from.clear()
      to.clear()
    }

    var i = 0
    var j = 0
    while (i < a.size || j < b.size) {
      when {
        i < a.size && j < b.size && a[i] == b[j] -> {
          flush()
          i++
          j++
        }
        j < b.size && (i == a.size || common[i][j + 1] >= common[i + 1][j]) -> to += b[j++]
        else -> from += a[i++]
      }
    }
    flush()
    return changes
  }
}
