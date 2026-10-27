package com.hypaintelligence.hypaintelligence.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import kotlin.math.max
import kotlin.math.min

class AudioWaveformView(context: Context) : View(context) {
  private val barCount = 56
  private val amplitudes = FloatArray(barCount)
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.FILL
    color = Color.WHITE
  }
  private val rect = RectF()
  private val density = context.resources.displayMetrics.density

  var barColor: Int
    get() = paint.color
    set(value) { paint.color = value; invalidate() }

  fun pushAmplitude(level: Float) {
    val clamped = max(0f, min(1f, level))
    System.arraycopy(amplitudes, 1, amplitudes, 0, barCount - 1)
    amplitudes[barCount - 1] = clamped
    invalidate()
  }

  fun reset() {
    for (i in amplitudes.indices) amplitudes[i] = 0f
    invalidate()
  }

  private var decorativeAnimating = false
  private val decorativeRunnable =
    object : Runnable {
      override fun run() {
        if (!decorativeAnimating) return
        pushAmplitude(0.28f + (Math.random().toFloat() * 0.6f))
        postDelayed(this, 90L)
      }
    }

  fun setDecorative(animating: Boolean) {
    if (animating == decorativeAnimating) return
    decorativeAnimating = animating
    removeCallbacks(decorativeRunnable)
    if (animating) post(decorativeRunnable)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    decorativeAnimating = false
    removeCallbacks(decorativeRunnable)
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f) return

    val gap = 2f * density
    val totalGap = gap * (barCount - 1)
    val barWidth = max(1.5f * density, (w - totalGap) / barCount)
    val radius = barWidth / 2f
    val cy = h / 2f
    val minBar = 2f * density
    val maxBar = h - 4f * density

    var x = 0f
    for (i in 0 until barCount) {
      val level = amplitudes[i]
      val barH = if (level <= 0f) minBar else minBar + level * (maxBar - minBar)
      val half = barH / 2f
      rect.set(x, cy - half, x + barWidth, cy + half)
      paint.alpha = (110 + (level * 145f)).toInt().coerceIn(110, 255)
      canvas.drawRoundRect(rect, radius, radius, paint)
      x += barWidth + gap
    }
  }
}
