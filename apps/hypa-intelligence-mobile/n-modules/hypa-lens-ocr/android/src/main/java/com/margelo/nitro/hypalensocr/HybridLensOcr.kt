package com.margelo.nitro.hypalensocr

import android.graphics.PixelFormat
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class HybridLensOcr : HybridLensOcrSpec() {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  private val executor = Executors.newSingleThreadExecutor()
  private val busy = AtomicBoolean(false)
  private val lock = Any()
  private var result: String? = null
  private val tracker = MotionTracker()

  @OptIn(ExperimentalGetImage::class)
  override fun startRecognition(frame: HybridFrameSpec): Boolean {
    val nativeFrame = frame as? NativeFrame ?: throw Error("Frame is not of type `NativeFrame`!")
    if (!busy.compareAndSet(false, true)) return false
    try {
      val image = nativeFrame.image
      val rotation = image.imageInfo.rotationDegrees
      val sideways = rotation % 180 != 0
      val width = (if (sideways) image.height else image.width).toDouble()
      val height = (if (sideways) image.width else image.height).toDouble()

      if (image.format != PixelFormat.RGBA_8888) {
        val mediaImage = image.image ?: throw Error("Frame does not have an underlying `Image`!")
        val text = Tasks.await(recognizer.process(InputImage.fromMediaImage(mediaImage, rotation)))
        finish(toJson(text, width, height))
        return true
      }

      val input = InputImage.fromBitmap(image.toBitmap(), rotation)
      recognizer
        .process(input)
        .addOnSuccessListener(executor) { text -> finish(toJson(text, width, height)) }
        .addOnFailureListener(executor) { finish("[]") }
      return true
    } catch (error: Throwable) {
      finish("[]")
      throw error
    }
  }

  override fun takeRecognition(): String {
    synchronized(lock) {
      val taken = result ?: ""
      result = null
      return taken
    }
  }

  override fun trackMotion(frame: HybridFrameSpec): String {
    val nativeFrame = frame as? NativeFrame ?: return ""
    val image = nativeFrame.image
    val plane = image.planes.firstOrNull() ?: return ""
    val buffer = plane.buffer
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val rgba = image.format == PixelFormat.RGBA_8888
    val shift =
      tracker.track(image.width, image.height) { x, y ->
        val offset = y * rowStride + x * pixelStride
        if (rgba) {
          val r = buffer.get(offset).toInt() and 0xff
          val g = buffer.get(offset + 1).toInt() and 0xff
          val b = buffer.get(offset + 2).toInt() and 0xff
          (r + 2 * g + b) / 4f
        } else {
          (buffer.get(offset).toInt() and 0xff).toFloat()
        }
      } ?: return ""
    return "${shift.first} ${shift.second}"
  }

  private fun finish(json: String) {
    synchronized(lock) { result = json }
    busy.set(false)
  }

  private fun toJson(text: Text, width: Double, height: Double): String {
    val lines = JSONArray()
    for (block in text.textBlocks) {
      for (line in block.lines) {
        val points = line.cornerPoints ?: continue
        if (points.size != 4) continue
        val corners = JSONArray()
        for (point in points) {
          corners.put(point.x / width).put(point.y / height)
        }
        lines.put(JSONObject().put("text", line.text).put("corners", corners))
      }
    }
    return lines.toString()
  }

  override fun dispose() {
    super.dispose()
    recognizer.close()
    executor.shutdown()
  }
}

fun interface Luma {
  fun at(x: Int, y: Int): Float
}

class MotionTracker {
  private var previous = FloatArray(0)
  private var previousWidth = 0
  private var previousHeight = 0

  private class Level(val previous: FloatArray, val current: FloatArray, val columns: Int, val rows: Int)

  fun track(width: Int, height: Int, luma: Luma): Pair<Double, Double>? {
    val rows = max(2 * margin(0) + 4, (COLUMNS.toDouble() * height / width).roundToInt())
    val cellWidth = width.toDouble() / COLUMNS
    val cellHeight = height.toDouble() / rows

    val grid = FloatArray(COLUMNS * rows)
    var sum = 0f
    for (row in 0 until rows) {
      for (column in 0 until COLUMNS) {
        var value = 0f
        for (sample in SAMPLES) {
          val x = min(width - 1, ((column + sample[0]) * cellWidth).toInt())
          val y = min(height - 1, ((row + sample[1]) * cellHeight).toInt())
          value += luma.at(x, y)
        }
        grid[row * COLUMNS + column] = value / 4
        sum += value / 4
      }
    }
    val mean = sum / grid.size
    var deviation = 0f
    for (index in grid.indices) {
      grid[index] -= mean
      deviation += abs(grid[index])
    }

    val previous = this.previous
    val sameSize = previousWidth == width && previousHeight == height && previous.size == grid.size
    this.previous = grid
    previousWidth = width
    previousHeight = height
    if (!sameSize) return null
    if (deviation / grid.size < 2) return 0.0 to 0.0

    val pyramid = mutableListOf(Level(previous, grid, COLUMNS, rows))
    for (level in 1 until LEVELS) {
      val above = pyramid.last()
      pyramid.add(
        Level(
          halve(above.previous, above.columns, above.rows),
          halve(above.current, above.columns, above.rows),
          above.columns / 2,
          above.rows / 2,
        ),
      )
    }

    var bestX = 0
    var bestY = 0
    for (level in LEVELS - 1 downTo 0) {
      val images = pyramid[level]
      val margin = margin(level)
      val coarsest = level == LEVELS - 1
      val xs = if (coarsest) -RADIUS..RADIUS else (2 * bestX - 2)..(2 * bestX + 2)
      val ys = if (coarsest) -RADIUS..RADIUS else (2 * bestY - 2)..(2 * bestY + 2)
      var lowest = Float.POSITIVE_INFINITY
      var nextX = 0
      var nextY = 0
      for (dy in ys) {
        for (dx in xs) {
          val cost = cost(images.previous, images.current, images.columns, images.rows, dx, dy, margin)
          if (cost < lowest) {
            lowest = cost
            nextX = dx
            nextY = dy
          }
        }
      }
      bestX = nextX
      bestY = nextY
    }

    val margin = margin(0)
    val cost = { dx: Int, dy: Int -> cost(previous, grid, COLUMNS, rows, dx, dy, margin) }
    var center = cost(bestX, bestY)
    if (bestX != 0 || bestY != 0) {
      val still = cost(0, 0)
      if (center >= still * 0.97f) {
        bestX = 0
        bestY = 0
        center = still
      }
    }
    val x = bestX + subcell(cost(bestX - 1, bestY), center, cost(bestX + 1, bestY))
    val y = bestY + subcell(cost(bestX, bestY - 1), center, cost(bestX, bestY + 1))
    return x / COLUMNS to y / rows
  }

  private fun margin(level: Int): Int {
    val scale = 1 shl (LEVELS - 1 - level)
    return RADIUS * scale + 2 * (scale - 1) + 1
  }

  private fun halve(grid: FloatArray, columns: Int, rows: Int): FloatArray {
    val halfColumns = columns / 2
    val halfRows = rows / 2
    val result = FloatArray(halfColumns * halfRows)
    for (row in 0 until halfRows) {
      for (column in 0 until halfColumns) {
        val top = 2 * row * columns + 2 * column
        val bottom = top + columns
        result[row * halfColumns + column] = (grid[top] + grid[top + 1] + grid[bottom] + grid[bottom + 1]) / 4
      }
    }
    return result
  }

  private fun cost(
    previous: FloatArray,
    current: FloatArray,
    columns: Int,
    rows: Int,
    dx: Int,
    dy: Int,
    margin: Int,
  ): Float {
    var total = 0f
    var count = 0
    for (row in margin until rows - margin) {
      val previousRow = row * columns
      val currentRow = (row + dy) * columns + dx
      for (column in margin until columns - margin) {
        total += abs(previous[previousRow + column] - current[currentRow + column])
      }
      count += columns - 2 * margin
    }
    return if (count > 0) total / count else Float.POSITIVE_INFINITY
  }

  private fun subcell(before: Float, center: Float, after: Float): Double {
    val rise = before + after - 2 * center
    if (rise <= 0) return 0.0
    return (0.5f * (before - after) / rise).toDouble().coerceIn(-0.5, 0.5)
  }

  private companion object {
    const val COLUMNS = 160
    const val RADIUS = 6
    const val LEVELS = 3
    val SAMPLES = arrayOf(doubleArrayOf(0.25, 0.25), doubleArrayOf(0.75, 0.25), doubleArrayOf(0.25, 0.75), doubleArrayOf(0.75, 0.75))
  }
}
