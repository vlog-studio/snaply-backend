import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where downloaded renders wait for the share sheet. Under the cache root on
 * purpose: the OS may reclaim it, and everything here can be re-downloaded —
 * the server keeps the render, this is only the local copy sharing needs.
 */
const shareCacheDirectory = new Directory(Paths.cache, 'share-movie');

/**
 * Bring a render's file local, for handing to the share sheet.
 *
 * `expo-sharing` accepts local files only — an `https://` URL passed through
 * is a failed share — so a remote render is downloaded to the cache first and
 * the local path is what gets shared. A `uri` that is already local (mock
 * mode never produces one, but a future local render might) passes through
 * untouched.
 *
 * `cacheKey` names the local copy, so it must identify the render *version* —
 * the caller keys it on the movie and its `renderedAt`. The remote URL cannot
 * be the name: it is a signed link whose query changes on every resolution
 * while pointing at the same bytes. A key already on disk is reused without
 * touching the network, which is what makes sharing twice instant.
 *
 * Downloaded to a `.part` name and renamed only when complete, so a download
 * that dies half-way (app killed, network dropped) can never leave a file
 * that a later share would hand out as if it were whole.
 */
export async function downloadRenderFile(uri: string, cacheKey: string): Promise<string> {
  if (!/^https?:\/\//.test(uri)) return uri;

  shareCacheDirectory.create({ idempotent: true, intermediates: true });
  const local = new File(shareCacheDirectory, `${cacheKey}.mp4`);
  if (local.exists) return local.uri;

  const partial = new File(shareCacheDirectory, `${cacheKey}.part`);
  const downloaded = await File.downloadFileAsync(uri, partial, { idempotent: true });
  await downloaded.move(local);
  return local.uri;
}
