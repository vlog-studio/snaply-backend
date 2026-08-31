import { useRef, useState } from 'react';

import { useAddSnap, type Snap } from '@/entities/snap';
import { persistLocalRecording } from '@/shared/lib/recording-files';
import { trimVideo } from '@/shared/lib/video-trim';

import { createExtractedSnap } from './create-extracted-snap';
import { MaxExtractSec } from './extract-limits';

const EXTRACT_SNAP_FAILED = '컷을 담지 못했어요. 다시 시도해 주세요.';

/**
 * The extraction action: cut the chosen window out of a gallery video into a
 * new file, persist it as a recording, and create its snap metadata — the
 * import-side sibling of `features/capture-moment`. From `addSnap` on, an
 * extracted snap is indistinguishable from a captured one: the upload worker
 * finds it as a pending entry, the library lists it, movies can cut it.
 *
 * Owns its pending/error state and guards re-entry; it never navigates — the
 * screen stays on the source video, ready to extract the next cut.
 */
export function useExtractSnap() {
  const addSnap = useAddSnap();
  const [isExtracting, setIsExtracting] = useState(false);
  // State updates are visible on the next render. A ref closes the smaller
  // same-render window where two presses/callers could both observe
  // `isExtracting === false` and create duplicate files before React commits.
  const extractingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function extractSnap(
    sourceUri: string,
    startSec: number,
    endSec: number,
  ): Promise<Snap | null> {
    if (extractingRef.current) return null;
    // The screen's window already obeys the limits; this guard is for drift —
    // a settled gesture value a rounding step past the ceiling is clamped, an
    // inverted or empty window is refused. The floor is *not* re-imposed here:
    // a source shorter than `MinExtractSec` legitimately yields a window the
    // size of the whole file, and stretching it back out would ask the trimmer
    // for footage past the file's end.
    const lengthSec = endSec - startSec;
    if (lengthSec <= 0) return null;
    const clampedEndSec = startSec + Math.min(lengthSec, MaxExtractSec);

    extractingRef.current = true;
    setIsExtracting(true);
    setError(null);
    try {
      const trimmed = await trimVideo(sourceUri, {
        startMs: Math.round(startSec * 1000),
        endMs: Math.round(clampedEndSec * 1000),
      });
      const recording = await persistLocalRecording(trimmed.uri);
      const snap = createExtractedSnap(recording, {
        trimmed,
        requestedDurationSec: clampedEndSec - startSec,
      });
      addSnap(snap);
      return snap;
    } catch {
      setError(EXTRACT_SNAP_FAILED);
      return null;
    } finally {
      extractingRef.current = false;
      setIsExtracting(false);
    }
  }

  return { extractSnap, isExtracting, error, clearError: () => setError(null) };
}
