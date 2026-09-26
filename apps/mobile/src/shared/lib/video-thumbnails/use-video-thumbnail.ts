import { useEffect, useState } from 'react';

import { getVideoThumbnail } from './video-thumbnails';

// In-memory index of frames this session has already resolved. The disk cache
// makes re-resolving cheap but still asynchronous — a remounting consumer (the
// roll sheet swaps its whole grid when entering/leaving reorder mode) would
// paint a blank frame for a beat and fade the thumbnail back in. Known frames
// are returned synchronously instead, so a remount repaints at once. Failed
// extractions are deliberately not indexed; they stay retryable per mount.
// Safe to read during render: an entry is written once and never changes.
const resolvedByUri = new Map<string, string>();

// Extractions in flight, so consumers asking for the same video at the same
// moment — the studio draws one snap in its recent row and in every template
// card whose slot holds it — share one native call instead of racing each
// other to write the same cache file. Cleared once the call settles, whatever
// its answer, so a failure stays retryable.
const pendingByUri = new Map<string, Promise<string | undefined>>();

function resolveThumbnail(uri: string): Promise<string | undefined> {
  const pending = pendingByUri.get(uri);
  if (pending) return pending;
  const request = getVideoThumbnail(uri)
    .then((thumbnailUri) => {
      if (thumbnailUri !== undefined) resolvedByUri.set(uri, thumbnailUri);
      return thumbnailUri;
    })
    .finally(() => pendingByUri.delete(uri));
  pendingByUri.set(uri, request);
  return request;
}

/**
 * Lazily resolves a video's cached first frame. Returns `undefined` while the
 * frame is being extracted and when extraction fails, so a caller can hold its
 * placeholder in both cases. A frame already resolved this session is returned
 * synchronously from the first render.
 *
 * The resolved frame is stored together with the URI it belongs to and reported
 * only while that URI is still the one being asked about. A caller that swaps
 * sources therefore falls back to its placeholder immediately instead of
 * flashing the previous video's frame.
 */
export function useVideoThumbnail(uri: string | undefined): string | undefined {
  const known = uri ? resolvedByUri.get(uri) : undefined;
  const [resolved, setResolved] = useState<{ uri: string; thumbnailUri?: string }>();

  useEffect(() => {
    if (!uri || resolvedByUri.get(uri) !== undefined) return;
    let isActive = true;
    void resolveThumbnail(uri).then((thumbnailUri) => {
      if (isActive) setResolved({ uri, thumbnailUri });
    });
    return () => {
      isActive = false;
    };
  }, [uri]);

  if (known !== undefined) return known;
  return resolved && resolved.uri === uri ? resolved.thumbnailUri : undefined;
}
