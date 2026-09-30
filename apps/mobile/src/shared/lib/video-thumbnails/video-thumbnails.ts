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

/**
 * How many remote thumbnails download at once. A library arriving from another
 * device can bring a hundred snaps in one go; letting every cell's image start
 * at the same moment would starve the rest of the app's requests.
 */
const MAX_PARALLEL_THUMBNAIL_DOWNLOADS = 4;

let activeDownloads = 0;
const waitingDownloads: (() => void)[] = [];

async function withDownloadSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_PARALLEL_THUMBNAIL_DOWNLOADS) {
    await new Promise<void>((resolve) => waitingDownloads.push(resolve));
  }
  activeDownloads += 1;
  try {
    return await task();
  } finally {
    activeDownloads -= 1;
    waitingDownloads.shift()?.();
  }
}

/**
 * Stores a remote image as the cached first frame of `uri` — for a video whose
 * file is not on the device (a snap shot on another device), so its frame comes
 * from the server instead of being extracted. An already cached frame is kept.
 * Resolves to the cached frame's URI, or `undefined` when the download fails.
 */
export async function saveVideoThumbnail(
  uri: string,
  remoteUrl: string,
): Promise<string | undefined> {
  ensureThumbnailsDirectory();
  const cached = thumbnailFileForUri(uri);
  if (cached.exists) return cached.uri;
  try {
    return await withDownloadSlot(async () => {
      const partial = new File(thumbnailsDirectory, `${cacheKeyForUri(uri)}.part`);
      if (partial.exists) partial.delete();
      const downloaded = await File.downloadFileAsync(remoteUrl, partial, { idempotent: true });
      if (cached.exists) cached.delete();
      await downloaded.move(cached);
      return cached.uri;
    });
  } catch {
    return undefined;
  }
}

/**
 * Hands a video's cached first frame over to another path — for a video whose
 * file is about to live somewhere else (a snap deleted from this device only
 * keeps its cover while its file becomes the fetched copy of the server's).
 * Leaves a frame already cached for `toUri` in place, and does nothing when
 * `fromUri` has none; losing a frame only means drawing it again.
 */
export async function moveVideoThumbnail(fromUri: string, toUri: string): Promise<void> {
  const source = thumbnailFileForUri(fromUri);
  if (!source.exists) return;
  const target = thumbnailFileForUri(toUri);
  if (target.exists) {
    source.delete();
    return;
  }
  ensureThumbnailsDirectory();
  await source.move(target);
}

/** Removes a cached thumbnail when its source video is deleted. */
export function deleteVideoThumbnail(uri: string): void {
  const cached = thumbnailFileForUri(uri);
  if (cached.exists) cached.delete();
}
