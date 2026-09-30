// Web has no device photo album in this app: recordings live in the native
// document directory and never exist on web. These inert stubs mirror the native
// adapter's contract so shared consumers stay platform-agnostic.
export type AlbumPermission = { granted: boolean; canAskAgain: boolean };

const UNAVAILABLE: AlbumPermission = { granted: false, canAskAgain: false };

export function getAlbumPermission(): Promise<AlbumPermission> {
  return Promise.resolve(UNAVAILABLE);
}

export function requestAlbumPermission(): Promise<AlbumPermission> {
  return Promise.resolve(UNAVAILABLE);
}

export function saveVideoToAlbum(_fileUri: string): Promise<void> {
  return Promise.reject(new Error('There is no photo album on web.'));
}
