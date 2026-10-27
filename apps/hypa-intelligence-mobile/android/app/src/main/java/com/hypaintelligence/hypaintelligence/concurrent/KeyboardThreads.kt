package com.hypaintelligence.hypaintelligence.concurrent

import android.os.Process
import java.util.concurrent.ThreadFactory

object KeyboardThreads {
  private const val COMPUTE_PRIORITY =
    Process.THREAD_PRIORITY_BACKGROUND + Process.THREAD_PRIORITY_MORE_FAVORABLE

  fun io(name: String): ThreadFactory = factory(name, Process.THREAD_PRIORITY_BACKGROUND)

  fun compute(name: String): ThreadFactory = factory(name, COMPUTE_PRIORITY)

  private fun factory(name: String, priority: Int): ThreadFactory = ThreadFactory { runnable ->
    Thread({
      Process.setThreadPriority(priority)
      runnable.run()
    }, name)
      .apply { isDaemon = true }
  }
}
