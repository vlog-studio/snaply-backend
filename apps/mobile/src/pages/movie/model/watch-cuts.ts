import { useMemo } from 'react';

import { cutDurationSec, type Movie, type SnapRef } from '@/entities/movie';
import { useSnapIndex } from '@/entities/snap';

import type { Cut } from './use-movie-cuts';

/**
 * The cut list watch mode plays: the render's own composition.
 *
 * A `ready` movie's live cut list can lawfully drift after the run (edits
 * commit as they land, and only `generating` freezes them), but what the user
 * came to *watch* is the finished movie — so watch mode reads the snapshot the
 * render was made from (`render.snapRefs`), not the working list. Until a
 * compositing backend produces a real file, playing that snapshot back to back
 * is what the finished movie is.
 *
 * A render stored before the snapshot field existed has none; the live list is
 * the only honest stand-in, and for an unedited movie it is the same
 * composition anyway.
 */
export function watchRefs(movie: Pick<Movie, 'snapRefs' | 'render'>): SnapRef[] {
  const source = movie.render?.snapRefs;
  const refs = source && source.length > 0 ? source : movie.snapRefs;
  return [...refs].sort((left, right) => left.order - right.order);
}

/**
 * How long the watched movie runs, for the facts line.
 *
 * A render with a file (`uri`) is what watch mode plays, so its stored length
 * is the answer outright — the file keeps playing even after every snap it was
 * made from is deleted, and the cut sum would then claim 0초 beside a movie
 * that runs. Without a file, `render.durationSec` counts only while the render
 * also remembers *what* it was made of. A render without a snapshot plays the
 * live list instead (`watchRefs`), and quoting the stored length over cuts it
 * does not describe printed "18초" beside a 0.9초 playlist. The rule mirrors
 * the stage's own choice of player exactly, so the length always describes
 * what actually plays.
 */
export function watchDurationSec(
  movie: Pick<Movie, 'snapRefs' | 'render'>,
  cuts: readonly Cut[],
): number {
  if (movie.render?.uri) return movie.render.durationSec;
  const source = movie.render?.snapRefs;
  if (movie.render && source && source.length > 0) return movie.render.durationSec;
  return cuts.reduce((total, cut) => total + cut.usedSec, 0);
}

/**
 * `watchRefs` resolved against the snap library, in the same row shape the
 * studio's cut list uses — a cut whose original was deleted keeps its row
 * (`snap: undefined`) and the playlist resolution skips it, exactly as the
 * studio does.
 */
export function useWatchCuts(movie: Movie | undefined): Cut[] {
  const snapIndex = useSnapIndex();
  return useMemo(() => {
    if (!movie) return [];
    return watchRefs(movie).map((ref) => {
      const snap = snapIndex.get(ref.snapId);
      return { ref, snap, usedSec: snap ? cutDurationSec(ref, snap.durationSec) : 0 };
    });
  }, [movie, snapIndex]);
}
