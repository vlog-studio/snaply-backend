import AVFoundation
import ExpoModulesCore

/**
 Cuts a `[startMs, endMs]` window out of a local video into a new file.

 Exports through `AVAssetExportSession` with the passthrough preset — no
 re-encode, the cut lands on the nearest keyframes — and falls back to a
 re-encoding preset for sources whose container cannot be passed through into
 MP4. The output lands in the caches directory; the caller moves it into
 permanent storage (`shared/lib/recording-files`), the same hand-off the
 camera's temporary recording makes.
 */
public class VideoTrimModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoTrim")

    AsyncFunction("trim") { (sourceUri: String, startMs: Double, endMs: Double, promise: Promise) in
      guard endMs > startMs else {
        promise.reject("ERR_VIDEO_TRIM", "The trim window is empty.")
        return
      }
      guard let sourceUrl = URL(string: sourceUri), sourceUrl.isFileURL else {
        promise.reject("ERR_VIDEO_TRIM", "The source is not a local file URI.")
        return
      }

      let asset = AVURLAsset(url: sourceUrl)
      let outputDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("video-trim", isDirectory: true)
      try? FileManager.default.createDirectory(
        at: outputDirectory, withIntermediateDirectories: true)
      let outputUrl = outputDirectory.appendingPathComponent("trim-\(UUID().uuidString).mp4")

      let timeRange = CMTimeRange(
        start: CMTime(milliseconds: startMs),
        end: CMTime(milliseconds: endMs))

      Self.export(asset: asset, preset: AVAssetExportPresetPassthrough, to: outputUrl, timeRange: timeRange) { passthroughError in
        if passthroughError == nil {
          promise.resolve(Self.describeOutput(at: outputUrl))
          return
        }
        // Passthrough cannot write every source into MP4; re-encode instead.
        Self.export(asset: asset, preset: AVAssetExportPresetHighestQuality, to: outputUrl, timeRange: timeRange) { reencodeError in
          if reencodeError == nil {
            promise.resolve(Self.describeOutput(at: outputUrl))
          } else {
            try? FileManager.default.removeItem(at: outputUrl)
            promise.reject("ERR_VIDEO_TRIM", "The trim export failed.")
          }
        }
      }
    }
  }

  private static func export(
    asset: AVAsset,
    preset: String,
    to outputUrl: URL,
    timeRange: CMTimeRange,
    completion: @escaping (Error?) -> Void
  ) {
    try? FileManager.default.removeItem(at: outputUrl)
    guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
      completion(VideoTrimError.sessionUnavailable)
      return
    }
    session.outputURL = outputUrl
    session.outputFileType = .mp4
    session.timeRange = timeRange
    session.exportAsynchronously {
      completion(session.status == .completed ? nil : (session.error ?? VideoTrimError.exportFailed))
    }
  }

  /**
   The output's real properties, read back from the file rather than assumed
   from the request: the exporter lands on keyframes, so the file's length is
   authoritative, and the display size must account for the track's rotation
   (`preferredTransform`).
   */
  private static func describeOutput(at outputUrl: URL) -> [String: Any] {
    let asset = AVURLAsset(url: outputUrl)
    var width = 0
    var height = 0
    if let track = asset.tracks(withMediaType: .video).first {
      let size = track.naturalSize.applying(track.preferredTransform)
      width = Int(abs(size.width).rounded())
      height = Int(abs(size.height).rounded())
    }
    let durationMs = Int((CMTimeGetSeconds(asset.duration) * 1000).rounded())
    return [
      "uri": outputUrl.absoluteString,
      "width": width,
      "height": height,
      "durationMs": max(durationMs, 0),
    ]
  }
}

private enum VideoTrimError: Error {
  case sessionUnavailable
  case exportFailed
}

private extension CMTime {
  init(milliseconds: Double) {
    self.init(value: CMTimeValue(milliseconds.rounded()), timescale: 1000)
  }
}
