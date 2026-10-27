package com.hypaintelligence.hypaintelligence.prediction

import android.os.Handler
import android.os.Looper
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

enum class InferencePriority {
  PREDICTION,
  CORRECTION,
}

class InferenceScheduler(
  private val debounceMs: () -> Long,
  private val onSuperseded: () -> Unit,
) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val executor: ExecutorService =
    Executors.newSingleThreadExecutor(KeyboardThreads.compute("hypa-neural"))

  private var debounced: Runnable? = null
  private var debouncedPriority: InferencePriority? = null
  private var runningPriority: InferencePriority? = null
  private var pending: PendingWork? = null

  fun schedule(priority: InferencePriority, work: () -> Unit) {
    clearDebounced()
    val runnable =
      Runnable {
        debounced = null
        debouncedPriority = null
        val running = runningPriority
        if (running == null) {
          dispatch(priority, work)
          return@Runnable
        }
        pending = PendingWork(priority, work)
        onSuperseded()
      }
    debounced = runnable
    debouncedPriority = priority
    mainHandler.postDelayed(runnable, debounceMs())
  }

  fun cancelPredictions() {
    if (debouncedPriority == InferencePriority.PREDICTION) clearDebounced()
    if (pending?.priority == InferencePriority.PREDICTION) pending = null
    if (runningPriority == InferencePriority.PREDICTION) onSuperseded()
  }

  fun cancelPending() {
    clearDebounced()
    pending = null
    if (runningPriority != null) onSuperseded()
  }

  fun shutdown() {
    cancelPending()
    executor.shutdown()
  }

  private fun clearDebounced() {
    debounced?.let { mainHandler.removeCallbacks(it) }
    debounced = null
    debouncedPriority = null
  }

  private fun dispatch(priority: InferencePriority, work: () -> Unit) {
    runningPriority = priority
    executor.execute {
      try {
        work()
      } finally {
        mainHandler.post {
          runningPriority = null
          pending?.let { next ->
            pending = null
            dispatch(next.priority, next.work)
          }
        }
      }
    }
  }

  private class PendingWork(val priority: InferencePriority, val work: () -> Unit)
}
