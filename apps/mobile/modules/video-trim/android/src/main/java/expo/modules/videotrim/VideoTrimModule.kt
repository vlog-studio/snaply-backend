package expo.modules.videotrim

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

private class VideoTrimException(message: String, cause: Throwable? = null) :
  CodedException("ERR_VIDEO_TRIM", message, cause)

/**
 * Cuts a `[startMs, endMs]` window out of a local video into a new file, via
 * androidx media3's Transformer. No effects are applied, so Transformer keeps
 * the original streams where the container allows it and re-encodes only when
 * it must; either way the output is an MP4 the rest of the app treats exactly
 * like a camera recording.
 *
 * The output lands in the app's cache directory — the caller is expected to
 * move it into permanent storage (`shared/lib/recording-files`), the same
 * hand-off the camera's temporary recording makes.
 */
class VideoTrimModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("VideoTrim")

    AsyncFunction("trim") { sourceUri: String, startMs: Double, endMs: Double, promise: Promise ->
      val context = appContext.reactContext
        ?: throw VideoTrimException("The app context is gone.")
      if (endMs <= startMs) {
        throw VideoTrimException("The trim window is empty.")
      }

      val outputDirectory = File(context.cacheDir, OUTPUT_DIRECTORY_NAME)
      outputDirectory.mkdirs()
      val outputFile = File(outputDirectory, "trim-${UUID.randomUUID()}.mp4")

      // Transformer requires a thread with a Looper for both construction and
      // start; the module's async functions run on a worker without one.
      mainHandler.post {
        try {
          startExport(context, sourceUri, startMs.toLong(), endMs.toLong(), outputFile, promise)
        } catch (cause: Throwable) {
          outputFile.delete()
          promise.reject(VideoTrimException("Could not start the trim.", cause))
        }
      }
    }
  }

  private fun startExport(
    context: Context,
    sourceUri: String,
    startMs: Long,
    endMs: Long,
    outputFile: File,
    promise: Promise,
  ) {
    val mediaItem = MediaItem.Builder()
      .setUri(sourceUri)
      .setClippingConfiguration(
        MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(startMs)
          .setEndPositionMs(endMs)
          .build(),
      )
      .build()

    val transformer = Transformer.Builder(context)
      .addListener(
        object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            promise.resolve(describeOutput(outputFile))
          }

          override fun onError(
            composition: Composition,
            exportResult: ExportResult,
            exportException: ExportException,
          ) {
            outputFile.delete()
            promise.reject(VideoTrimException("The trim export failed.", exportException))
          }
        },
      )
      .build()

    transformer.start(EditedMediaItem.Builder(mediaItem).build(), outputFile.absolutePath)
  }

  /**
   * The output's real properties, read back from the file rather than assumed
   * from the request: the exporter lands on frame boundaries, so the file's
   * length is authoritative, and the display size must account for a rotation
   * the container stores as metadata.
   */
  private fun describeOutput(outputFile: File): Map<String, Any> {
    var width = 0
    var height = 0
    var durationMs = 0L
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(outputFile.absolutePath)
      val rawWidth = retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
        ?.toIntOrNull() ?: 0
      val rawHeight = retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
        ?.toIntOrNull() ?: 0
      val rotation = retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
        ?.toIntOrNull() ?: 0
      durationMs = retriever
        .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.toLongOrNull() ?: 0L
      val swapped = rotation == 90 || rotation == 270
      width = if (swapped) rawHeight else rawWidth
      height = if (swapped) rawWidth else rawHeight
    } catch (_: Throwable) {
      // Metadata is best-effort; the caller falls back to its own numbers.
    } finally {
      try {
        retriever.release()
      } catch (_: Throwable) {
        // Releasing a retriever that failed to open can itself throw.
      }
    }
    return mapOf(
      "uri" to Uri.fromFile(outputFile).toString(),
      "width" to width,
      "height" to height,
      "durationMs" to durationMs,
    )
  }

  private companion object {
    const val OUTPUT_DIRECTORY_NAME = "video-trim"
  }
}
