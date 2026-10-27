package com.hypaintelligence.hypaintelligence.neural

import android.app.ActivityManager
import android.content.Context

enum class DeviceTier { LOW, MEDIUM, HIGH }

object DeviceCapability {
  @Volatile private var cached: DeviceTier? = null

  val cpuCores: Int by lazy { Runtime.getRuntime().availableProcessors() }

  fun totalRamMb(context: Context): Long {
    val memInfo = ActivityManager.MemoryInfo()
    (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(memInfo)
    return memInfo.totalMem / (1024 * 1024)
  }

  fun tier(context: Context): DeviceTier {
    cached?.let { return it }
    val ram = totalRamMb(context)
    val tier = when {
      ram <= 2048 || cpuCores <= 2 -> DeviceTier.LOW
      ram <= 4096 || cpuCores <= 4 -> DeviceTier.MEDIUM
      else -> DeviceTier.HIGH
    }
    cached = tier
    return tier
  }

  fun debounceMs(context: Context): Long = when (tier(context)) {
    DeviceTier.LOW -> 450L
    DeviceTier.MEDIUM -> 350L
    DeviceTier.HIGH -> 250L
  }

}
