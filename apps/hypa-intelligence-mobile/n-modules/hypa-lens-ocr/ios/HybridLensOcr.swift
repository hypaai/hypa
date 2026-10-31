import CoreVideo
import ImageIO
import NitroModules
import Vision
import VisionCamera

class HybridLensOcr: HybridLensOcrSpec {
  private let queue = DispatchQueue(label: "ai.hypa.lens.ocr", qos: .userInitiated)
  private let lock = NSLock()
  private var busy = false
  private var result: String?
  private let tracker = MotionTracker()

  func startRecognition(frame: any HybridFrameSpec) throws -> Bool {
    guard let nativeFrame = frame as? any NativeFrame,
      let pixelBuffer = nativeFrame.sampleBuffer?.imageBuffer
    else {
      throw RuntimeError.error(withMessage: "Frame is invalid or already disposed.")
    }
    lock.lock()
    if busy {
      lock.unlock()
      return false
    }
    busy = true
    lock.unlock()

    let orientation = frame.orientation.toImageOrientation(isMirrored: frame.isMirrored)
    queue.async { [weak self] in
      let json = (try? Self.recognize(pixelBuffer: pixelBuffer, orientation: orientation)) ?? "[]"
      guard let self else { return }
      self.lock.lock()
      self.result = json
      self.busy = false
      self.lock.unlock()
    }
    return true
  }

  func takeRecognition() throws -> String {
    lock.lock()
    defer { lock.unlock() }
    let taken = result ?? ""
    result = nil
    return taken
  }

  func trackMotion(frame: any HybridFrameSpec) throws -> String {
    guard let nativeFrame = frame as? any NativeFrame,
      let pixelBuffer = nativeFrame.sampleBuffer?.imageBuffer,
      CVPixelBufferGetPixelFormatType(pixelBuffer) == kCVPixelFormatType_32BGRA
    else {
      return ""
    }
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return "" }
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let shift = tracker.track(
      width: CVPixelBufferGetWidth(pixelBuffer),
      height: CVPixelBufferGetHeight(pixelBuffer)
    ) { x, y in
      let offset = y * bytesPerRow + x * 4
      return (Float(bytes[offset]) + 2 * Float(bytes[offset + 1]) + Float(bytes[offset + 2])) / 4
    }
    guard let shift else { return "" }
    return "\(shift.x) \(shift.y)"
  }

  private static func recognize(pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.0125
    if #available(iOS 16.0, *) {
      request.automaticallyDetectsLanguage = true
    }

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
    try handler.perform([request])

    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let corners = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
      return [
        "text": candidate.string,
        "corners": corners.flatMap { [$0.x, 1 - $0.y] },
      ]
    }
    let data = try JSONSerialization.data(withJSONObject: lines)
    return String(decoding: data, as: UTF8.self)
  }
}

final class MotionTracker {
  private static let columns = 160
  private static let radius = 6
  private static let levels = 3
  private static let samples: [(Double, Double)] = [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]

  private var previous: [Float] = []
  private var previousWidth = 0
  private var previousHeight = 0

  private static func margin(level: Int) -> Int {
    let scale = 1 << (levels - 1 - level)
    return radius * scale + 2 * (scale - 1) + 1
  }

  func track(width: Int, height: Int, luma: (Int, Int) -> Float) -> (x: Double, y: Double)? {
    let columns = Self.columns
    let rows = max(2 * Self.margin(level: 0) + 4, Int((Double(columns) * Double(height) / Double(width)).rounded()))
    let cellWidth = Double(width) / Double(columns)
    let cellHeight = Double(height) / Double(rows)

    var grid = [Float](repeating: 0, count: columns * rows)
    var sum: Float = 0
    for row in 0..<rows {
      for column in 0..<columns {
        var value: Float = 0
        for (fx, fy) in Self.samples {
          let x = min(width - 1, Int((Double(column) + fx) * cellWidth))
          let y = min(height - 1, Int((Double(row) + fy) * cellHeight))
          value += luma(x, y)
        }
        grid[row * columns + column] = value / 4
        sum += value / 4
      }
    }
    let mean = sum / Float(grid.count)
    var deviation: Float = 0
    for index in grid.indices {
      grid[index] -= mean
      deviation += abs(grid[index])
    }

    let previous = self.previous
    let sameSize = previousWidth == width && previousHeight == height && previous.count == grid.count
    self.previous = grid
    previousWidth = width
    previousHeight = height
    guard sameSize else { return nil }
    if deviation / Float(grid.count) < 2 { return (0, 0) }

    var pyramid = [(previous: previous, current: grid, columns: columns, rows: rows)]
    for _ in 1..<Self.levels {
      let level = pyramid[pyramid.count - 1]
      pyramid.append((
        Self.halve(level.previous, columns: level.columns, rows: level.rows),
        Self.halve(level.current, columns: level.columns, rows: level.rows),
        level.columns / 2,
        level.rows / 2
      ))
    }

    var best = (x: 0, y: 0)
    for level in stride(from: Self.levels - 1, through: 0, by: -1) {
      let images = pyramid[level]
      let margin = Self.margin(level: level)
      let coarsest = level == Self.levels - 1
      let xs = coarsest ? -Self.radius...Self.radius : (2 * best.x - 2)...(2 * best.x + 2)
      let ys = coarsest ? -Self.radius...Self.radius : (2 * best.y - 2)...(2 * best.y + 2)
      var lowest = Float.infinity
      for dy in ys {
        for dx in xs {
          let cost = Self.cost(
            images.previous, images.current, columns: images.columns, rows: images.rows,
            dx: dx, dy: dy, margin: margin)
          if cost < lowest {
            lowest = cost
            best = (dx, dy)
          }
        }
      }
    }

    let finest = pyramid[0]
    let margin = Self.margin(level: 0)
    let cost = { (dx: Int, dy: Int) in
      Self.cost(finest.previous, finest.current, columns: columns, rows: rows, dx: dx, dy: dy, margin: margin)
    }
    var center = cost(best.x, best.y)
    if best.x != 0 || best.y != 0 {
      let still = cost(0, 0)
      if center >= still * 0.97 {
        best = (0, 0)
        center = still
      }
    }
    let x = Double(best.x) + Self.subcell(cost(best.x - 1, best.y), center, cost(best.x + 1, best.y))
    let y = Double(best.y) + Self.subcell(cost(best.x, best.y - 1), center, cost(best.x, best.y + 1))
    return (x / Double(columns), y / Double(rows))
  }

  private static func halve(_ grid: [Float], columns: Int, rows: Int) -> [Float] {
    let halfColumns = columns / 2
    let halfRows = rows / 2
    var result = [Float](repeating: 0, count: halfColumns * halfRows)
    for row in 0..<halfRows {
      for column in 0..<halfColumns {
        let top = 2 * row * columns + 2 * column
        let bottom = top + columns
        result[row * halfColumns + column] = (grid[top] + grid[top + 1] + grid[bottom] + grid[bottom + 1]) / 4
      }
    }
    return result
  }

  private static func cost(
    _ previous: [Float], _ current: [Float], columns: Int, rows: Int, dx: Int, dy: Int, margin: Int
  ) -> Float {
    var total: Float = 0
    var count = 0
    var row = margin
    while row < rows - margin {
      let previousRow = row * columns
      let currentRow = (row + dy) * columns + dx
      var column = margin
      while column < columns - margin {
        total += abs(previous[previousRow + column] - current[currentRow + column])
        column += 1
      }
      count += columns - 2 * margin
      row += 1
    }
    return count > 0 ? total / Float(count) : .infinity
  }

  private static func subcell(_ before: Float, _ center: Float, _ after: Float) -> Double {
    let rise = before + after - 2 * center
    guard rise > 0 else { return 0 }
    return max(-0.5, min(0.5, Double(0.5 * (before - after) / rise)))
  }
}

extension CameraOrientation {
  fileprivate func toImageOrientation(isMirrored: Bool) -> CGImagePropertyOrientation {
    switch self {
    case .up:
      return isMirrored ? .upMirrored : .up
    case .down:
      return isMirrored ? .downMirrored : .down
    case .left:
      // VisionCamera counter-rotates "left" clockwise into preview coordinates.
      return isMirrored ? .rightMirrored : .right
    case .right:
      return isMirrored ? .leftMirrored : .left
    }
  }
}
