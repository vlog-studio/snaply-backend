import { useCallback, useState } from 'react';

import { finishRemoteMovie, useFinishMovie as useRecordFinished } from '@/entities/movie';
import { ApiError } from '@/shared/api';

/** Why the finish did not happen, or `undefined` when it did. */
export type FinishRefusal =
  /** A run owns the movie right now; the server refused (409). */
  | 'generating'
  /** The server no longer has the movie. */
  | 'gone'
  /** The request itself failed; nothing changed, pressing again is the recovery. */
  | 'unreachable';

export type FinishOutcome = { finished: boolean; refused?: FinishRefusal };

export type MovieFinishing = {
  /** True from the press until the server has answered. */
  busy: boolean;
  /** Why the last attempt was refused, in the user's words. Cleared on the next attempt. */
  errorMessage: string | undefined;
  /**
   * Finishes the movie: the server deletes the result file, the movie stays
   * as a draft to make again. **Irreversible** — call it only from a control
   * whose words say so and which the user pressed for that purpose.
   */
  finish: (movieId: string) => Promise<FinishOutcome>;
};

export const FinishRefusalMessages: Record<FinishRefusal, string> = {
  generating: '만드는 중에는 정리할 수 없어요.',
  gone: '이미 삭제됐거나 없는 무비예요.',
  unreachable: '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
};

/**
 * 끝내기 — the user tells us they have taken the result (MOV-17).
 *
 * The server deletes the completed file and keeps the movie; the store then
 * drops the render and returns the movie to a draft. The order matters: the
 * server is asked first and the store follows its answer, because a movie
 * shown as finished whose file the server still holds would be the lie the
 * other way round from the one MOV-18 forbids.
 *
 * **Never called on a guess.** The system share sheet does not say whether the
 * user saved the file (`shared/lib/sharing`: a share is "offered", never
 * "confirmed"), so a share closing must not call this — a user who dismissed
 * the sheet would lose their movie. Only an explicit control does, and its
 * words make the loss plain. Posting to an SNS is the one path that finishes
 * without asking, and there the *server* does it, having seen the platform's
 * success itself.
 */
export function useFinishMovie(): MovieFinishing {
  const recordFinished = useRecordFinished();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const finish = useCallback(
    async (movieId: string): Promise<FinishOutcome> => {
      setBusy(true);
      setErrorMessage(undefined);
      try {
        const { finishedAt } = await finishRemoteMovie(movieId);
        recordFinished(movieId, finishedAt);
        return { finished: true };
      } catch (error) {
        const refused: FinishRefusal =
          error instanceof ApiError && error.status === 409
            ? 'generating'
            : error instanceof ApiError && error.status === 404
              ? 'gone'
              : 'unreachable';
        if (refused === 'unreachable' && __DEV__) {
          console.warn(`[finish-movie] could not finish ${movieId}:`, String(error));
        }
        setErrorMessage(FinishRefusalMessages[refused]);
        return { finished: false, refused };
      } finally {
        setBusy(false);
      }
    },
    [recordFinished],
  );

  return { busy, errorMessage, finish };
}
