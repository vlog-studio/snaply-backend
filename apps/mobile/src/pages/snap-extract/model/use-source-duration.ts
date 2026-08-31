import { useEffect, useState } from 'react';

import { readVideoDuration } from '@/shared/lib/video-duration';

type SourceDuration = {
  /** Seconds, once known; `undefined` while reading and when unreadable. */
  durationSec: number | undefined;
  isReading: boolean;
  /** The platform could not read the file — the screen has nothing to cut. */
  isUnreadable: boolean;
};

/**
 * How long the source video runs. The picker usually already knows
 * (`knownDurationSec` arrives as a route param); only a source the picker
 * could not measure is read back from the file. Everything on the screen —
 * the strip's width, the tiles, the window's clamps — hangs off this number,
 * so the strip renders only once it is known.
 */
export function useSourceDuration(
  sourceUri: string,
  knownDurationSec: number | undefined,
): SourceDuration {
  const [measured, setMeasured] = useState<{ uri: string; durationSec: number | undefined }>();

  const known =
    knownDurationSec !== undefined && Number.isFinite(knownDurationSec) && knownDurationSec > 0
      ? knownDurationSec
      : undefined;

  useEffect(() => {
    if (known !== undefined) return;
    let isActive = true;
    void readVideoDuration(sourceUri).then((durationSec) => {
      if (isActive) setMeasured({ uri: sourceUri, durationSec });
    });
    return () => {
      isActive = false;
    };
  }, [sourceUri, known]);

  if (known !== undefined) {
    return { durationSec: known, isReading: false, isUnreadable: false };
  }
  const answered = measured?.uri === sourceUri ? measured : undefined;
  return {
    durationSec: answered?.durationSec,
    isReading: answered === undefined,
    isUnreadable: answered !== undefined && answered.durationSec === undefined,
  };
}
