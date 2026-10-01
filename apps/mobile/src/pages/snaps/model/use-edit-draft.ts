import { useCallback, useRef, useState } from 'react';

import { MovieSnapLimit, type Movie } from '@/entities/movie';
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
 * state and the picks on screen.
 *
 * A failure that may pass is retried with the same button (`다시 시도`); one that
 * will not pass today — the daily cap — offers the hand-made movie, which needs
 * no draft, as long as the picks fit in one.
 */
export function draftConfirmation(
  state: EditDraftState,
  picks: readonly string[],
): DraftConfirmation {
  if (state.kind === 'busy') {
    return { label: '편집하는 중…', disabled: true, busy: true, action: 'draft' };
  }
  const refused = state.kind === 'failed' && state.picks === picks ? state.refused : undefined;
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
 * Asks for the edit draft and hands the movie it made to `onMovie`. One request
 * at a time: a second tap while one is out does nothing, so a slow answer
 * cannot make two movies.
 */
export function useEditDraft(onMovie: (movie: Movie) => void) {
  const { startMovieFromDraft } = useComposeMovie();
  const [state, setState] = useState<EditDraftState>({ kind: 'idle' });
  const inFlight = useRef(false);

  const start = useCallback(
    async (picks: readonly string[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState({ kind: 'busy' });
      try {
        const outcome = await startMovieFromDraft(picks);
        if (outcome?.refused) {
          setState({ kind: 'failed', refused: outcome.refused, picks });
          return;
        }
        setState({ kind: 'idle' });
        if (outcome?.movie) onMovie(outcome.movie);
      } finally {
        inFlight.current = false;
      }
    },
    [startMovieFromDraft, onMovie],
  );

  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, start, reset };
}
