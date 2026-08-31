import { Directory, File, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

// Thumbnails are derived cover art, not source data — they live in the cache
// directory keyed by the source file's base name so each clip is extracted at
// most once and shared across every surface that previews it (the cut grid,
// Home's contact-sheet strip, negative frames). Losing the cache only forces
// re-extraction; it never loses a clip.
const THUMBNAILS_DIRECTORY_NAME = 'video-thumbnails';

// A hair past t=0 skips the occasional black leader frame some clips open on.
const SAMPLE_TIME_MS = 200;

const thumbnailsDirectory = new Directory(Paths.cache, THUMBNAILS_DIRECTORY_NAME);

function ensureThumbnailsDirectory() {
  thumbnailsDirectory.create({ idempotent: true, intermediates: true });
}

/** Where in the video to sample a frame. */
export type VideoThumbnailOptions = {
  /** Defaults to a hair past the start ({@link SAMPLE_TIME_MS}). */
  timeMs?: number;
};

// The cache key is the source file's base name, so the same underlying file
// resolves to one thumbnail whether the caller holds a LocalRecording or a bare
// clip URI. A frame sampled at an explicit offset gets its own key — a strip of
// one long video needs many distinct frames from the same file.
function cacheKeyForUri(uri: string, timeMs?: number): string {
  const lastSegment = uri.split('/').pop() ?? uri;
  const withoutQuery = lastSegment.split('?')[0];
  const base = withoutQuery.replace(/\.[^.]+$/, '');
  return timeMs === undefined ? base : `${base}@${Math.round(timeMs)}`;
}

function thumbnailFileForUri(uri: string, timeMs?: number): File {
  return new File(thumbnailsDirectory, `${cacheKeyForUri(uri, timeMs)}.jpg`);
}

/**
 * Returns a local URI for a frame of the video — its near-first frame by
 * default, or the frame at `timeMs` — extracting and caching it on first
 * request. Resolves to `undefined` when extraction fails so callers can fall
 * back to a placeholder without breaking.
 *
 * Extraction is a one-shot native call (expo-video-thumbnails) that does not
 * keep a live video player around. Rendering many frames at once therefore never
 * exhausts the platform's limited pool of hardware video decoders — unlike
 * mounting one player per frame, which silently drops the earlier frames.
 */
export async function getVideoThumbnail(
  uri: string,
  options?: VideoThumbnailOptions,
): Promise<string | undefined> {
  ensureThumbnailsDirectory();

  const cached = thumbnailFileForUri(uri, options?.timeMs);
  if (cached.exists) return cached.uri;

  try {
    const { uri: generatedUri } = await VideoThumbnails.getThumbnailAsync(uri, {
      time: options?.timeMs ?? SAMPLE_TIME_MS,
      quality: 0.6,
    });

    const generated = new File(generatedUri);
    if (cached.exists) cached.delete();
    await generated.move(cached);

    return cached.uri;
  } catch {
    return undefined;
  }
}

/** Removes a cached thumbnail when its source video is deleted. */
export function deleteVideoThumbnail(uri: string): void {
  const cached = thumbnailFileForUri(uri);
  if (cached.exists) cached.delete();
}
