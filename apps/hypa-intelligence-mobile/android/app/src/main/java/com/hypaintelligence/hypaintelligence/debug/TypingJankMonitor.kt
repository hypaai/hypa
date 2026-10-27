package com.hypaintelligence.hypaintelligence.debug

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.View
import com.hypaintelligence.hypaintelligence.BuildConfig

class TypingJankMonitor(private val anchor: View) {
  private companion object {
    const val TAG = "HypaJank"

    const val LATE_FRAME_FACTOR = 1.5f

    const val BURST_IDLE_MS = 900L

    const val NANOS_PER_MS = 1_000_000.0
    const val DEFAULT_REFRESH_HZ = 60f
  }

  private val handler = Handler(Looper.getMainLooper())
  private val choreographer by lazy { Choreographer.getInstance() }
  private val endBurst = Runnable { finish() }

  private var running = false
  private var lastFrameNs = 0L
  private var frameBudgetNs = 0L
  private var frames = 0
  private var lateFrames = 0
  private var worstGapNs = 0L
  private var keys = 0

  private val frameCallback =
    object : Choreographer.FrameCallback {
      override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        if (lastFrameNs != 0L) {
          val gap = frameTimeNanos - lastFrameNs
          frames++
          if (gap > frameBudgetNs) {
            lateFrames++
            if (gap > worstGapNs) worstGapNs = gap
          }
        }
        lastFrameNs = frameTimeNanos
        choreographer.postFrameCallback(this)
      }
    }

  fun onKeyDown() {
    if (!BuildConfig.DEBUG) return
    keys++
    handler.removeCallbacks(endBurst)
    handler.postDelayed(endBurst, BURST_IDLE_MS)
    if (running) return

    val refreshHz = anchor.display?.refreshRate?.takeIf { it > 1f } ?: DEFAULT_REFRESH_HZ
    frameBudgetNs = ((1_000f / refreshHz) * LATE_FRAME_FACTOR * NANOS_PER_MS).toLong()
    running = true
    lastFrameNs = 0L
    Log.e(TAG, "TEMP armed budget=$frameBudgetNs")
    choreographer.postFrameCallback(frameCallback)
  }

  fun cancel() {
    if (!BuildConfig.DEBUG || !running) return
    handler.removeCallbacks(endBurst)
    stop()
  }

  private fun finish() {
    Log.e(TAG, "TEMP finish running=$running frames=$frames keys=$keys budget=$frameBudgetNs")
    if (!running) return
    val late = lateFrames
    val total = frames
    val worstMs = worstGapNs / NANOS_PER_MS
    val typed = keys
    stop()
    if (total == 0) return
    if (late == 0) {
      Log.d(TAG, "burst of $typed keys: $total frames, none late")
    } else {
      Log.w(
        TAG,
        "burst of $typed keys: $late/$total frames late, worst gap ${"%.1f".format(worstMs)}ms",
      )
    }
  }

  private fun stop() {
    running = false
    choreographer.removeFrameCallback(frameCallback)
    frames = 0
    lateFrames = 0
    worstGapNs = 0L
    lastFrameNs = 0L
    keys = 0
  }
}
