import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where render covers are kept. Under the cache root: every file here is a copy
 * of something the server still has, so the OS may reclaim the lot — a movie
 * whose cover is gone falls back to its snaps' frames, which is a degradation
 * the grid already knows how to draw.
 */
const coversDirectory = new Directory(Paths.cache, 'movie-covers');

/**
 * Bring a render's cover image onto the device, answering its local path — or
 * `undefined` when it could not be fetched.
 *
 * Never throws. A cover is decoration: a movie that finished is finished
 * whether or not its picture arrived, so every failure here answers "no cover"
 * and the caller writes nothing.
 *
 * `cacheKey` must identify the render *version* (the caller keys it on the
 * movie and its `renderedAt`), because the server's URL is a signed link whose
 * query changes on every resolution while naming the same bytes. Downloaded to
 * a `.part` name and renamed on completion, so an interrupted download cannot
 * be mistaken for a whole image.
 */
export async function downloadRenderThumbnail(
  url: string,
  cacheKey: string,
): Promise<string | undefined> {
  try {
    coversDirectory.create({ idempotent: true, intermediates: true });
    const cover = new File(coversDirectory, `${cacheKey}.jpg`);
    if (cover.exists) return cover.uri;

    const partial = new File(coversDirectory, `${cacheKey}.part`);
    const downloaded = await File.downloadFileAsync(url, partial, { idempotent: true });
    await downloaded.move(cover);
    return cover.uri;
  } catch (error) {
    if (__DEV__) console.warn(`[compose-movie] no cover for ${cacheKey}:`, String(error));
    return undefined;
  }
}
