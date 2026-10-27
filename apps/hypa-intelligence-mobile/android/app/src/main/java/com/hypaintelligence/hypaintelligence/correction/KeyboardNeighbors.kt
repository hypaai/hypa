package com.hypaintelligence.hypaintelligence.correction

object KeyboardNeighbors {
  private val rows = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")

  private val neighbors: Map<Char, Set<Char>> = buildMap {
    for ((rowIndex, row) in rows.withIndex()) {
      for ((col, ch) in row.withIndex()) {
        val adjacent = mutableSetOf<Char>()
        row.getOrNull(col - 1)?.let { adjacent.add(it) }
        row.getOrNull(col + 1)?.let { adjacent.add(it) }
        for (otherRow in listOf(rows.getOrNull(rowIndex - 1), rows.getOrNull(rowIndex + 1))) {
          if (otherRow == null) continue
          for (offset in -1..1) {
            otherRow.getOrNull(col + offset)?.let { adjacent.add(it) }
          }
        }
        put(ch, adjacent)
      }
    }
  }

  val keys: Set<Char>
    get() = neighbors.keys

  fun of(c: Char): Set<Char> = neighbors[c.lowercaseChar()].orEmpty()
}
