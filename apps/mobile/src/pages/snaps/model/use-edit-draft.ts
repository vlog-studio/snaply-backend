import { useCallback, useRef, useState } from 'react';

import { MovieDraftSnapLimit, MovieSnapLimit, type Movie } from '@/entities/movie';
import { useComposeMovie, type DraftRefusal } from '@/features/compose-movie';

/**
 * Where the edit draft's request stands. A failure remembers the picks it was
 * for: change a pick and the bar is back to its first state, because the
 * failure no longer describes what is on screen.
 */
export type EditDraftState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'failed'; refused: DraftRefusal; picks: readonly string[] };

/** What confirming the picks does right now. */
export type DraftConfirmation = {
  label: string;
  /** Why the last attempt did not open a movie, for the selection bar. */
  notice?: string;
  disabled: boolean;
  busy: boolean;
  /**
   * `draft` asks for the edit draft; `snaps` makes the hand-picked movie
   * instead — once today's drafts are used up, that is what is left.
   */
  action: 'draft' | 'snaps';
};

const ConfirmLabel = '자동으로 편집하기';

/**
 * The selection bar's confirm for the edit draft (MOV-21), from the request's
 * state, the picks on screen, and how many snaps one draft takes (`limit`).
 *
 * A failure that may pass is retried with the same button (`다시 시도`); one that
 * will not pass today — the daily cap — offers the hand-made movie, which needs
 * no draft, as long as the picks fit in one. Picks past the draft's cap cannot
 * pass at all, so the button waits for fewer and says how many to drop.
 */
export function draftConfirmation(
  state: EditDraftState,
  picks: readonly string[],
  limit: number,
): DraftConfirmation {
  if (state.kind === 'busy') {
    return { label: '편집하는 중…', disabled: true, busy: true, action: 'draft' };
  }
  // Checked before any failure: dropping picks starts a new state, and the cap
  // the server named still holds for it.
  if (picks.length > limit) {
    return {
      label: ConfirmLabel,
      notice: `자동 편집에는 스냅 ${limit}개까지 넣을 수 있어요. ${picks.length - limit}개를 빼 주세요.`,
      disabled: true,
      busy: false,
      action: 'draft',
    };
  }
  const refused = state.kind === 'failed' && state.picks === picks ? state.refused : undefined;
  if (refused === 'too-many') {
    // Refused without a cap to name: these picks will not pass, and how many to
    // drop is not known.
    return {
      label: ConfirmLabel,
      notice: '자동 편집에 넣기엔 스냅이 너무 많아요. 몇 개를 빼 주세요.',
      disabled: true,
      busy: false,
      action: 'draft',
    };
  }
  if (refused === 'unreachable') {
    return {
      label: '다시 시도',
      notice: '자동 편집을 하지 못했어요.',
      disabled: false,
      busy: false,
      action: 'draft',
    };
  }
  if (refused === 'limit') {
    const fits = picks.length <= MovieSnapLimit;
    return {
      label: '이 스냅으로 새 무비',
      notice: fits
        ? '오늘은 자동 편집을 다 썼어요.'
        : `오늘은 자동 편집을 다 썼어요. 새 무비에는 ${MovieSnapLimit}개까지 넣을 수 있어요.`,
      disabled: !fits,
      busy: false,
      action: 'snaps',
    };
  }
  return { label: ConfirmLabel, disabled: false, busy: false, action: 'draft' };
}

/**
 * Asks for the edit draft and resolves to the movie it made, if any. One
 * request at a time: a second tap while one is out resolves to nothing, so a
 * slow answer cannot make two movies.
 *
 * `limit` is how many snaps one draft takes: the app's own cap until the
 * server refuses with a lower one (`TOO_MANY_SNAPS`), then that one for as
 * long as this screen lives — the picking and the confirm follow it.
 */
export function useEditDraft() {
  const { startMovieFromDraft } = useComposeMovie();
  const [state, setState] = useState<EditDraftState>({ kind: 'idle' });
  const [limit, setLimit] = useState(MovieDraftSnapLimit);
  const inFlight = useRef(false);

  const start = useCallback(
    async (picks: readonly string[]): Promise<Movie | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setState({ kind: 'busy' });
      try {
        const outcome = await startMovieFromDraft(picks);
        if (outcome?.refused) {
          if (outcome.max !== undefined) setLimit(outcome.max);
          setState({ kind: 'failed', refused: outcome.refused, picks });
          return undefined;
        }
        setState({ kind: 'idle' });
        return outcome?.movie;
      } finally {
        inFlight.current = false;
      }
    },
    [startMovieFromDraft],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, start, reset, limit };
}
