import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clearSnapDeleteTombstone, getDeleteTombstones } from '@/entities/snap';
import { ApiError } from '@/shared/api';

import { trashedSnapQueries } from '../api/trashed-snaps.queries';
import { restoreServerSnap } from '../api/restore-server-snap';

export type RestoreOutcome = {
  /** Back on the account; the library's next reconcile brings them in. */
  restored: string[];
  /** Past their retention, or deleted before files were kept — they cannot come back. */
  gone: string[];
  /** Not reached this time; trying again may work. */
  failed: string[];
};

const RestoreErrorMessage = '되살리지 못했어요. 다시 시도해 주세요.';
const GoneMessage = '보관 기간이 끝나 되살릴 수 없어요.';

/**
 * Brings snaps deleted everywhere back from 최근 삭제 (SNAP-20) — from its list,
 * or from the 되돌리기 right after deleting.
 *
 * A delete reaches the server through the upload worker's tombstones, so right
 * after deleting it may not have gone out yet. Such a tombstone is cleared
 * first: the server then never deletes the snap, and it counts as restored even
 * if the restore request below cannot get through. The request is still sent,
 * because the worker may have been sending that DELETE at the same moment.
 *
 * Only the snap comes back. The cuts the delete took out of movies stay out.
 * Bringing it into this device's library is the reconcile's job — the caller
 * asks for a pass once something came back.
 */
export function useRestoreSnaps() {
  const queryClient = useQueryClient();
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string>();

  async function restoreSnaps(videoIds: readonly string[]): Promise<RestoreOutcome> {
    const outcome: RestoreOutcome = { restored: [], gone: [], failed: [] };
    if (videoIds.length === 0) return outcome;
    setRestoringIds(new Set(videoIds));
    setErrorMessage(undefined);

    const unsent = new Set(getDeleteTombstones());
    for (const videoId of videoIds) {
      const wasUnsent = unsent.has(videoId);
      if (wasUnsent) clearSnapDeleteTombstone(videoId);
      try {
        await restoreServerSnap(videoId);
        outcome.restored.push(videoId);
      } catch (error) {
        if (wasUnsent) outcome.restored.push(videoId);
        else if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
          outcome.gone.push(videoId);
        } else outcome.failed.push(videoId);
      }
    }

    void queryClient.invalidateQueries({ queryKey: trashedSnapQueries.all() });
    setRestoringIds(new Set());
    if (outcome.failed.length > 0) setErrorMessage(RestoreErrorMessage);
    else if (outcome.gone.length > 0) setErrorMessage(GoneMessage);
    return outcome;
  }

  return { restoreSnaps, restoringIds, errorMessage, clearError: () => setErrorMessage(undefined) };
}
