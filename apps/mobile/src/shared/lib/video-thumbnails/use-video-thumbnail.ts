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
    void getVideoThumbnail(uri).then((thumbnailUri) => {
      if (thumbnailUri !== undefined) resolvedByUri.set(uri, thumbnailUri);
      if (isActive) setResolved({ uri, thumbnailUri });
    });
    return () => {
      isActive = false;
    };
  }, [uri]);

  if (known !== undefined) return known;
  return resolved && resolved.uri === uri ? resolved.thumbnailUri : undefined;
}
