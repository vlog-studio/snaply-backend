import { useMemo, useState } from 'react';

import {
  cutDurationSec,
  cutsDurationSec,
  isEditedSinceRender,
  sameCuts,
  sameTrimWindow,
  useMovieById,
  withTrim,
  withoutTrim,
  type Movie,
  type SnapRef,
} from '@/entities/movie';
import { useSnapIndex, type Snap } from '@/entities/snap';
import { canEditMovie, useComposeMovie, type CutsRefusal } from '@/features/compose-movie';

/** One row of the cut list: the cut, the snap behind it, and its position. */
export type Cut = {
  ref: SnapRef;
  /**
   * The original this cut points at, or `undefined` when it was deleted. The row
   * still exists — the user has to be able to see and remove a dead cut.
   */
  snap: Snap | undefined;
  /** How long this cut plays: its trim window, or the whole snap. */
  usedSec: number;
};

export type MovieCuts = {
  movie: Movie | undefined;
  /** The stored cut list; every edit commits into it immediately. */
  cuts: Cut[];
  /** How long the cut list plays, in seconds. */
  totalSec: number;
  /** False while a job owns the movie. */
  canEdit: boolean;
  /** Set when the last edit was refused. */
  refusal: CutsRefusal | undefined;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * How many edits deep this visit's history is (`undo` shrinks it). Lets the
   * screen tell edits made since a point in time — e.g. since the studio face
   * was entered — apart from ones already answered for.
   */
  editCount: number;
  /**
   * True when the cut list no longer matches what the current render was made
   * from — the user edited a finished movie, knowingly or not.
   */
  editedSinceRender: boolean;
  /**
   * Puts the cut list back to the render's own composition. An ordinary commit:
   * it lands in the history, so it can itself be undone.
   */
  restoreRenderCuts: () => void;
  moveCut: (index: number, direction: -1 | 1) => void;
  removeCut: (index: number) => void;
  /** Sets a cut's trim window. The rules are the entity's; this only stores. */
  trimCut: (index: number, startSec: number, endSec: number) => void;
  /** Puts a cut back to playing whole. */
  resetTrim: (index: number) => void;
  /** Steps the cut list back to before the last edit made on this screen. */
  undo: () => void;
  /** Reapplies the edit the last undo stepped over. */
  redo: () => void;
};

type CutHistory = {
  /** Stored lists this screen wrote over, oldest first; `undo` walks back. */
  past: readonly SnapRef[][];
  /** Lists `undo` stepped over, next first; `redo` walks forward. */
  future: readonly SnapRef[][];
  /** The list this hook last committed, so its own write is not read as an
   * outside change when the store reflects it back. */
  written?: readonly SnapRef[];
};

const EmptyHistory: CutHistory = { past: [], future: [] };

/**
 * The cut list's edits: committed as they land, walked with undo/redo.
 *
 * Every edit — a reorder, a removal, a trim — is written through
 * `features/compose-movie` immediately, and this hook keeps the lists each
 * write replaced so 되돌리기/복원 can replay them. There is no staged copy and
 * no save button: what the stage previews *is* the movie, always. The rules
 * that used to gate the one commit gate each edit instead — the last cut's ✕
 * is a disabled control, and a refused write (`refusal`) changes nothing.
 *
 * The history belongs to this visit of this screen. When the stored list
 * changes for a reason other than this hook's own write — a snap deleted from
 * the Snap tab, snaps appended by the picker — the history no longer describes
 * states reachable from what is stored, so it is dropped rather than replayed
 * onto a list it does not know.
 */
export function useMovieCuts(movieId: string | undefined): MovieCuts {
  const movie = useMovieById(movieId);
  const snapIndex = useSnapIndex();
  const { saveCuts } = useComposeMovie();

  const storedRefs = useMemo(
    () => (movie ? [...movie.snapRefs].sort((left, right) => left.order - right.order) : []),
    [movie],
  );

  const [refusal, setRefusal] = useState<CutsRefusal>();
  const [history, setHistory] = useState<CutHistory>(EmptyHistory);

  // The stored list as of the last render. When it moves and neither this
  // hook's own write nor a content-preserving store update (a style save)
  // explains it, the change came from outside — drop the history.
  const [tracked, setTracked] = useState<readonly SnapRef[]>(storedRefs);
  if (tracked !== storedRefs) {
    setTracked(storedRefs);
    if (!sameCuts(tracked, storedRefs)) {
      const ours = history.written !== undefined && sameCuts(history.written, storedRefs);
      if (!ours) {
        setHistory(EmptyHistory);
        setRefusal(undefined);
      }
    }
  }

  // The rule is the feature's, not this hook's: a screen that decided for itself
  // which statuses are editable would be one release away from disagreeing with
  // the commit that has the final say.
  const canEdit = movie !== undefined && canEditMovie(movie);

  const cuts = useMemo(
    () =>
      storedRefs.map((ref) => {
        const snap = snapIndex.get(ref.snapId);
        return { ref, snap, usedSec: snap ? cutDurationSec(ref, snap.durationSec) : 0 };
      }),
    [storedRefs, snapIndex],
  );
  const totalSec = useMemo(
    () => cutsDurationSec(storedRefs, (snapId) => snapIndex.get(snapId)?.durationSec),
    [storedRefs, snapIndex],
  );

  /** Writes `next` as the stored list and remembers what it replaced. */
  const commit = (next: SnapRef[]) => {
    if (!movieId) return;
    const outcome = saveCuts(movieId, next);
    if (outcome.refused) {
      setRefusal(outcome.refused);
      return;
    }
    setRefusal(undefined);
    setHistory((current) => ({ past: [...current.past, storedRefs], future: [], written: next }));
  };

  /** Rewrites the stored list to a remembered one, for undo/redo. */
  const restore = (target: readonly SnapRef[], step: (current: CutHistory) => CutHistory) => {
    if (!movieId) return;
    const outcome = saveCuts(movieId, [...target]);
    if (outcome.refused) {
      setRefusal(outcome.refused);
      return;
    }
    setRefusal(undefined);
    setHistory((current) => ({ ...step(current), written: target }));
  };

  const undo = () => {
    const target = history.past[history.past.length - 1];
    if (!target) return;
    restore(target, (current) => ({
      past: current.past.slice(0, -1),
      future: [storedRefs, ...current.future],
    }));
  };

  const redo = () => {
    const target = history.future[0];
    if (!target) return;
    restore(target, (current) => ({
      past: [...current.past, storedRefs],
      future: current.future.slice(1),
    }));
  };

  const moveCut = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= storedRefs.length) return;
    const next = [...storedRefs];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const removeCut = (index: number) => {
    if (storedRefs.length <= 1) {
      setRefusal('empty');
      return;
    }
    commit(storedRefs.filter((_, position) => position !== index));
  };

  const replaceCut = (index: number, change: (ref: SnapRef, snap: Snap) => SnapRef) => {
    const snap = snapIndex.get(storedRefs[index]?.snapId ?? '');
    if (!snap) return;
    const next = [...storedRefs];
    next[index] = change(next[index], snap);
    if (next[index] === storedRefs[index]) return;
    commit(next);
  };

  const trimCut = (index: number, startSec: number, endSec: number) =>
    replaceCut(index, (ref, snap) => {
      const trimmed = withTrim(ref, startSec, endSec, snap.durationSec);
      // `withTrim` builds a new object even for an unchanged window; comparing the
      // window keeps a settled drag that moved nothing from committing the same
      // list back and pushing a no-op history entry.
      return sameTrimWindow(ref, trimmed) ? ref : trimmed;
    });

  const resetTrim = (index: number) => replaceCut(index, (ref) => withoutTrim(ref));

  // The render's composition, back as the stored list. Not a rollback of the
  // render itself — there is only ever one — but of the cut list that drifted
  // out from under it; a snapshot the movie no longer answers to (already
  // matching, or never taken) restores nothing.
  const restoreRenderCuts = () => {
    const source = movie?.render?.snapRefs;
    if (!source || source.length === 0) return;
    const target = [...source].sort((left, right) => left.order - right.order);
    if (sameCuts(storedRefs, target)) return;
    commit(target);
  };

  return {
    movie,
    cuts,
    totalSec,
    canEdit,
    refusal,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    editCount: history.past.length,
    editedSinceRender: movie !== undefined && isEditedSinceRender(movie),
    restoreRenderCuts,
    moveCut,
    removeCut,
    trimCut,
    resetTrim,
    undo,
    redo,
  };
}
