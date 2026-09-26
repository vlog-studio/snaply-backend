import { useEffect, useState } from 'react';

import { getVideoThumbnail } from './video-thumbnails';

// In-memory index of frames this session has already resolved. The disk cache
// makes re-resolving cheap but still asynchronous — a remounting consumer (the
// roll sheet swaps its whole grid when entering/leaving reorder mode) would
// paint a blank frame for a beat and fade the thumbnail back in. Known frames
// are returned synchronously instead, so a remount repaints at once. Failed
// extractions are deliberately not indexed; they stay retryable per mount.
// Safe to read during render: an entry is written once and never changes.
// Keyed by `frameKey`, so a frame sampled mid-clip never answers for the first.
const resolvedByKey = new Map<string, string>();

// Extractions in flight, so consumers asking for the same frame at the same
// moment — the studio draws one snap in its recent row and in every template
// card whose slot holds it — share one native call instead of racing each
// other to write the same cache file. Cleared once the call settles, whatever
// its answer, so a failure stays retryable.
const pendingByKey = new Map<string, Promise<string | undefined>>();

/** Which frame of which video — the same rounding the disk cache keys on. */
function frameKey(uri: string, timeMs: number | undefined): string {
  return timeMs === undefined ? uri : `${uri}@${Math.round(timeMs)}`;
}

function resolveThumbnail(uri: string, timeMs: number | undefined): Promise<string | undefined> {
  const key = frameKey(uri, timeMs);
  const pending = pendingByKey.get(key);
  if (pending) return pending;
  const request = getVideoThumbnail(uri, timeMs === undefined ? undefined : { timeMs })
    .then((thumbnailUri) => {
      if (thumbnailUri !== undefined) resolvedByKey.set(key, thumbnailUri);
      return thumbnailUri;
    })
    .finally(() => pendingByKey.delete(key));
  pendingByKey.set(key, request);
  return request;
}

/**
 * Lazily resolves a video's cached first frame — or, with `timeMs`, the frame
 * that far in. Returns `undefined` while the frame is being extracted and when
 * extraction fails, so a caller can hold its placeholder in both cases. A frame
 * already resolved this session is returned synchronously from the first render.
 *
 * The resolved frame is stored together with the frame it belongs to and
 * reported only while that frame is still the one being asked about. A caller
 * that swaps sources therefore falls back to its placeholder immediately
 * instead of flashing the previous video's frame.
 */
export function useVideoThumbnail(uri: string | undefined, timeMs?: number): string | undefined {
  const key = uri === undefined ? undefined : frameKey(uri, timeMs);
  const known = key ? resolvedByKey.get(key) : undefined;
  const [resolved, setResolved] = useState<{ key: string; thumbnailUri?: string }>();

  useEffect(() => {
    if (!uri || !key || resolvedByKey.get(key) !== undefined) return;
    let isActive = true;
    void resolveThumbnail(uri, timeMs).then((thumbnailUri) => {
      if (isActive) setResolved({ key, thumbnailUri });
    });
    return () => {
      isActive = false;
    };
  }, [key, uri, timeMs]);

  if (known !== undefined) return known;
  return resolved && resolved.key === key ? resolved.thumbnailUri : undefined;
}
