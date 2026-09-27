import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where a snap shot on another device keeps its video once this device has
 * fetched it. Under the cache root on purpose: the server holds the snap, this
 * is only the local copy playback needs, and the OS may reclaim it — the next
 * play fetches it again. Kept apart from `recordings/`, which holds this
 * device's own originals and is listed as such by the capture screen.
 */
const SERVER_SNAPS_DIRECTORY_NAME = 'server-snaps';

const serverSnapsDirectory = new Directory(Paths.cache, SERVER_SNAPS_DIRECTORY_NAME);

function ensureServerSnapsDirectory() {
  serverSnapsDirectory.create({ idempotent: true, intermediates: true });
}

/**
 * The local path a server snap's video lives at, whether or not it has been
 * fetched yet. Named by the server's video id, which is also the snap's id, so
 * the same snap always lands at the same path and its cached thumbnail (keyed
 * by the file's base name) is found under the same name.
 */
export function serverSnapFileUri(videoId: string): string {
  return new File(serverSnapsDirectory, `${videoId}.mp4`).uri;
}

/** Whether `uri` names a file in the server-snap cache rather than a recording. */
export function isServerSnapFile(uri: string): boolean {
  return new File(uri).parentDirectory.uri === serverSnapsDirectory.uri;
}

export function serverSnapFileExists(uri: string): boolean {
  return new File(uri).exists;
}

/**
 * Downloads a server snap's video to its path. Written to a `.part` name and
 * renamed only when complete, so a download cut off half-way (app killed,
 * network dropped) never leaves a file that playback would take as whole.
 */
export async function downloadServerSnapFile(url: string, uri: string): Promise<void> {
  ensureServerSnapsDirectory();
  const target = new File(uri);
  if (target.parentDirectory.uri !== serverSnapsDirectory.uri) {
    throw new Error('Server snaps can only be stored in their own cache.');
  }
  if (target.exists) return;
  const partial = new File(serverSnapsDirectory, `${target.name}.part`);
  if (partial.exists) partial.delete();
  const downloaded = await File.downloadFileAsync(url, partial, { idempotent: true });
  await downloaded.move(target);
}

/**
 * Deletes a server snap's local copy. Refuses anything outside the server-snap
 * cache, for the reason `deleteLocalRecording` refuses anything outside
 * `recordings/`: a path handed in by mistake must never reach another file.
 */
export function deleteServerSnapFile(uri: string): void {
  const file = new File(uri);
  if (file.parentDirectory.uri !== serverSnapsDirectory.uri) {
    throw new Error('Only server snap copies can be deleted here.');
  }
  if (file.exists) file.delete();
}
