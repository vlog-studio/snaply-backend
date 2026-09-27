// Videos never persist on web (see recording-files.web.ts), so a snap from
// another device has nowhere to be fetched to. The path is still answered so a
// snap can be described; nothing is ever there.

export function serverSnapFileUri(videoId: string): string {
  return `server-snaps/${videoId}.mp4`;
}

export function isServerSnapFile(uri: string): boolean {
  return uri.startsWith('server-snaps/');
}

export function serverSnapFileExists(_uri: string): boolean {
  return false;
}

export async function downloadServerSnapFile(_url: string, _uri: string): Promise<void> {
  throw new Error('Snaps from other devices can only be played on iOS and Android.');
}

export function deleteServerSnapFile(_uri: string): void {}
