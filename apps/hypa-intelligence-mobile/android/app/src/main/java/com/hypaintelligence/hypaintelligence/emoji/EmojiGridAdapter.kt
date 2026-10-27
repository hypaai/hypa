package com.hypaintelligence.hypaintelligence.emoji

import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class EmojiGridAdapter(
  private val cellSizePx: Int,
  private val textSizeSp: Float,
  private val textColor: Int,
  private val onPick: (EmojiEntry) -> Unit,
  private val onPickAndHold: (View, EmojiEntry) -> Unit,
) : RecyclerView.Adapter<EmojiGridAdapter.CellHolder>() {
  private var entries: List<EmojiEntry> = emptyList()

  fun submit(next: List<EmojiEntry>) {
    entries = next
    notifyDataSetChanged()
  }

  override fun getItemCount(): Int = entries.size

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CellHolder {
    val cell =
      TextView(parent.context).apply {
        gravity = Gravity.CENTER
        includeFontPadding = false
        setTextColor(textColor)
        textSize = textSizeSp
        typeface = Typeface.DEFAULT
        layoutParams = ViewGroup.LayoutParams(cellSizePx, cellSizePx)
      }
    return CellHolder(cell)
  }

  override fun onBindViewHolder(holder: CellHolder, position: Int) {
    val entry = entries[position]
    holder.cell.text = entry.sequence
    holder.cell.setOnClickListener { onPick(entry) }
    holder.cell.setOnLongClickListener {
      if (entry.hasVariants) {
        onPickAndHold(holder.cell, entry)
        true
      } else {
        false
      }
    }
  }

  class CellHolder(val cell: TextView) : RecyclerView.ViewHolder(cell)
}
