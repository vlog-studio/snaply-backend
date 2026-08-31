import { useEffect, useState } from 'react';

import { getVideoThumbnail } from '@/shared/lib/video-thumbnails';

import type { StripTile } from './extract-strip-layout';

/**
 * Resolves the strip's thumbnail frames, strictly one at a time: extraction is
 * a one-shot native call, and firing a strip's worth at once contends for the
 * platform's small pool of media resources (the same constraint that keeps
 * `video-duration` on one player at a time). Tiles fill in left to right as
 * frames arrive; a frame that fails stays `undefined` and its tile keeps the
 * placeholder ground.
 *
 * Frames are stored together with the strip they belong to and reported only
 * while that strip is still the one being asked about — a swapped source
 * falls back to placeholders instead of flashing the previous video's frames.
 */
export function useStripThumbnails(
  sourceUri: string,
  tiles: readonly StripTile[],
): (string | undefined)[] {
  const [loaded, setLoaded] = useState<{ key: string; frames: (string | undefined)[] }>();
  // The tiles array is rebuilt per render; its content is what matters.
  const key = `${sourceUri}|${tiles.map((tile) => tile.timeMs).join(',')}`;

  useEffect(() => {
    if (tiles.length === 0) return;
    let isActive = true;
    void (async () => {
      for (let index = 0; index < tiles.length; index += 1) {
        const frame = await getVideoThumbnail(sourceUri, { timeMs: tiles[index].timeMs });
        if (!isActive) return;
        setLoaded((current) => {
          const frames = current?.key === key ? current.frames.slice() : [];
          frames[index] = frame;
          return { key, frames };
        });
      }
    })();
    return () => {
      isActive = false;
    };
    // `tiles` is rebuilt every render; `key` carries its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUri, key]);

  return loaded?.key === key ? loaded.frames : [];
}
