import type { VideoThumbnailOptions } from './video-thumbnails';

// Videos never persist on web (the file adapter lists none), so there is
// nothing to derive a thumbnail from.
export async function getVideoThumbnail(
  _uri: string,
  _options?: VideoThumbnailOptions,
): Promise<string | undefined> {
  return undefined;
}

export function deleteVideoThumbnail(_uri: string): void {}

export type { VideoThumbnailOptions };
