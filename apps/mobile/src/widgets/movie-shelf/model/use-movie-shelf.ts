import { useMemo } from 'react';

import {
  cutsDurationSec,
  movieJobRatio,
  useMovies,
  type Movie,
  type MovieStatus,
  type MovieStyle,
} from '@/entities/movie';
import { snapsByRefs, useSnapIndex, type SnapIndex } from '@/entities/snap';
import { formatDayHeading } from '@/shared/lib/datetime';

/** How many snap frames a movie card samples for its cover. */
const CoverFrameCount = 1;

/**
 * A movie reduced to what a card draws: its identity, how much material it
 * holds, how long it runs, and the first frames its cover samples.
 */
export type MovieSummary = {
  id: string;
  title: string;
  status: MovieStatus;
  style: MovieStyle;
  /** Cuts the movie holds, counted from its references. */
  snapCount: number;
  /** How long the movie plays, with every cut's trim applied. */
  totalSec: number;
  /** `오늘` / `어제` / `2026년 7월 20일` — when the movie was last worked on. */
  dateLabel: string;
  /** Up to three snap URIs, in cut order, for the cover. */
  coverUris: string[];
  /**
   * The finished render's own cover image (a local file), when the movie has
   * one. The grid prefers it over {@link coverUris} — a movie's cover art
   * should be the movie, not the raw material — and falls back to the frames
   * when it is missing or will not load. The board keeps the frames either way:
   * a row is a work list, and a strip of cuts says more there than one picture.
   */
  coverImageUri?: string;
  /** How far generation has come, 0–1. Present only while `generating`. */
  progress?: number;
  /** Why the last generation broke. Present only while `failed`. */
  error?: string;
};

/**
 * How far a job has come, as a fraction. The backend's own number, held on the
 * movie, so every surface drawing this movie agrees on one value and none of them
 * needs a ticker of its own — a card on a list is not where a user watches
 * progress climb.
 */
function jobProgress(movie: Movie): number | undefined {
  if (movie.status !== 'generating' || !movie.job) return undefined;
  return movieJobRatio(movie.job);
}

function summarize(movie: Movie, snapIndex: SnapIndex): MovieSummary {
  const snaps = snapsByRefs(movie.snapRefs, snapIndex);

  return {
    id: movie.id,
    title: movie.title,
    status: movie.status,
    style: movie.style,
    // Counted from the references, not the resolved snaps: how full a movie is
    // is a fact about the movie, and a cut whose original was deleted still
    // occupied a slot in it.
    snapCount: movie.snapRefs.length,
    totalSec: cutsDurationSec(movie.snapRefs, (snapId) => snapIndex.get(snapId)?.durationSec),
    dateLabel: formatDayHeading(movie.updatedAt),
    coverUris: snaps.slice(0, CoverFrameCount).map((snap) => snap.uri),
    ...(movie.render?.thumbnailUri ? { coverImageUri: movie.render.thumbnailUri } : null),
    progress: jobProgress(movie),
    // Only while failed: a movie keeps its last error through a retry so the
    // store can tell one attempt from the next, but a card showing it after the
    // movie recovered would be reporting a problem that is over.
    error: movie.status === 'failed' ? movie.error : undefined,
  };
}

/**
 * Every movie as a card, most recently worked on first.
 *
 * The movie↔snap join is cross-entity composition neither entity may own, and
 * both the studio board and the movie grid need it, which is what makes this a
 * widget rather than page code. The whole library is indexed once here and
 * shared across every movie, rather than resolved per movie.
 */
export function useMovieSummaries(): MovieSummary[] {
  const movies = useMovies();
  const snapIndex = useSnapIndex();

  return useMemo(
    () =>
      [...movies]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((movie) => summarize(movie, snapIndex)),
    [movies, snapIndex],
  );
}

/**
 * The studio board: every movie in one lane, with the unfinished ones first.
 *
 * One lane rather than the 작업 중 / 최근 완성 pair it replaced (2026-08-12).
 * Splitting by status put the same fact in two places — the lane heading and the
 * row's own status badge — and made the board render two "없어요" placeholders on
 * a device that simply had no movies yet. Ordering carries what the split
 * carried: what still needs the user is on top, and drafts, jobs in flight and
 * failures stay together, so a movie whose generation broke cannot fall between
 * two lanes. Within each half the summaries keep their most-recently-worked-on
 * order.
 */
export function useBoardMovies(): MovieSummary[] {
  const summaries = useMovieSummaries();
  return useMemo(
    () => [
      ...summaries.filter((movie) => movie.status !== 'ready'),
      ...summaries.filter((movie) => movie.status === 'ready'),
    ],
    [summaries],
  );
}
