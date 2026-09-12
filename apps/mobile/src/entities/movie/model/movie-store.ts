import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { localStore } from '@/shared/lib/local-store';
import { createScopedPersistence, deleteScopedState } from '@/shared/lib/scoped-store';
import { randomUuid } from '@/shared/lib/uuid';

import { DefaultMovieBgm } from '../lib/movie-bgm';
import { DefaultMovieStyle } from '../lib/movie-style';
import { mergeRemoteMovies, movieFromRemote, type PendingWrite } from '../lib/movie-sync';
import { movieTitle } from '../lib/movie-title';
import type { Movie, MovieArranger, MovieRender, MovieStyle, SnapRef } from './movie';
import type { RemoteMovie } from './remote-movie';

/** What the caller gets to decide when a movie is started from picked snaps. */
export type CreateMovieInput = {
  /** The cut list, in order. */
  snapIds: readonly string[];
  /** Optional — a blank name becomes the day the movie was started. */
  title?: string;
  /**
   * Who arranged the cut list. Defaults to `user`: snaps the user picked are
   * ordered by the user, and only template matching may claim otherwise.
   */
  arranger?: MovieArranger;
  /**
   * What the movie should start out looking and sounding like. A template says
   * so; a movie started from hand-picked snaps takes the defaults and the user
   * changes them once there is a result to change them against.
   */
  style?: MovieStyle;
  bgm?: string;
  /** Injectable for tests; production callers use the default. */
  createdAt?: number;
  /** Injectable for tests; production callers get a fresh uuid. */
  id?: string;
};

/**
 * The generation settings a style-step edit changes. Every field is optional so
 * one control writes one setting without restating the others.
 */
export type MovieStylePatch = {
  style?: MovieStyle;
  bgm?: string;
  captions?: boolean;
};

const MovieStoreName = 'snaply.movies';

/**
 * Owns movies: their cut lists, generation settings, and lifecycle state — as
 * **this device's copy of the account's movies on the server** (2026-09-12).
 *
 * The server holds the movies; the device holds a cache of them plus an
 * outbox. Every screen reads and writes this store exactly as it did when the
 * movies lived only here — a movie is made, edited and deleted at once, offline
 * or not — and the sync worker (`features/compose-movie`) carries the outbox to
 * the server and reads the server's copy back through `applyRemoteMovies`.
 * Which is why the write actions below mark the movie *pending* rather than
 * calling anything: the store knows what changed, the worker knows when the
 * server can take it (every cut's snap has to have finished uploading first).
 *
 * Persisted to a document-directory JSON file through `localStore`, so the
 * cache and the outbox survive a restart — an edit made offline is not lost
 * when the app is closed before it could be sent. The file belongs to one
 * account: `applyMovieScope` points persistence at the signed-in user's own
 * store file, and nothing is read until it does.
 *
 * Movies reference snaps by id only (see `SnapRef`); joining a movie to its snap
 * objects is a higher-layer concern (a page, or `widgets/movie-shelf`) so this
 * entity never imports `entities/snap`.
 *
 * Exported for co-located tests only. Application code consumes the focused
 * selector and action hooks below through the slice Public API.
 */
type MovieState = {
  movies: Movie[];
  /** Movies whose local state the server has not been told about, by write kind. */
  pending: Record<string, PendingWrite>;
  /** Movies deleted here that the server still holds. */
  pendingDeletes: string[];
  /**
   * Bumped on every local edit of a movie. The sync worker reads it before a
   * request and compares after, so an edit that lands mid-request keeps the
   * movie pending instead of being marked sent.
   */
  versions: Record<string, number>;
  hasHydrated: boolean;
  /** Whether the server's list has been read at least once for this account. */
  hasSynced: boolean;
  createMovie: (input: CreateMovieInput) => Movie;
  updateMovieCuts: (movieId: string, snapRefs: SnapRef[], updatedAt?: number) => void;
  updateMovieStyle: (movieId: string, patch: MovieStylePatch, updatedAt?: number) => void;
  setMovieArranger: (movieId: string, arranger: MovieArranger, updatedAt?: number) => void;
  renameMovie: (movieId: string, title: string, updatedAt?: number) => void;
  deleteMovie: (movieId: string) => void;
  beginMovieJob: (movieId: string, jobId: string, startedAt?: number) => void;
  advanceMovieJob: (movieId: string, progress: number, step?: string) => void;
  completeMovieJob: (movieId: string, render: MovieRender, updatedAt?: number) => void;
  setRenderThumbnail: (movieId: string, renderedAt: number, thumbnailUri: string) => void;
  failMovieJob: (movieId: string, error: string, detail?: string, updatedAt?: number) => void;
  cancelMovieJob: (movieId: string, updatedAt?: number) => void;
  finishMovie: (movieId: string, finishedAt: number) => void;
  removeSnapsEverywhere: (snapIds: readonly string[]) => void;
  applyRemoteMovies: (remote: readonly RemoteMovie[]) => void;
  markMovieSent: (movieId: string, remote: RemoteMovie, version: number) => void;
  markMovieGone: (movieId: string) => void;
  markMovieDeleteSent: (movieId: string) => void;
  setHasHydrated: (value: boolean) => void;
};

/**
 * Applies `change` to one movie, leaving the state object identical when the
 * movie is unknown or the change is a no-op.
 *
 * Identity matters more here than the brevity: the generation runner re-checks
 * every job on a timer and writes the step it finds, so a write that changed
 * nothing must not produce a new `movies` array — that would re-render every
 * movie surface, and re-run the runner's own effect, several times a second.
 */
function patchMovie(
  state: MovieState,
  movieId: string,
  change: (movie: Movie) => Movie,
): Pick<MovieState, 'movies'> | MovieState {
  const current = state.movies.find((movie) => movie.id === movieId);
  if (!current) return state;
  const next = change(current);
  if (next === current) return state;
  return { movies: state.movies.map((movie) => (movie.id === movieId ? next : movie)) };
}

/**
 * `patchMovie` for an edit the server has to hear about: the same write, plus
 * the movie marked pending and its version bumped. A movie still waiting to be
 * created stays a `create` — the one request carries everything.
 */
function editMovie(
  state: MovieState,
  movieId: string,
  change: (movie: Movie) => Movie,
): Partial<MovieState> | MovieState {
  const patched = patchMovie(state, movieId, change);
  if (patched === state) return state;
  return {
    ...patched,
    pending: { ...state.pending, [movieId]: state.pending[movieId] ?? 'update' },
    versions: { ...state.versions, [movieId]: (state.versions[movieId] ?? 0) + 1 },
  };
}

/**
 * Builds a fresh draft: the given snaps in the given order, the default style
 * and ratio, and no render. Everything else about a movie is decided later, in
 * the movie screen, after a first result exists.
 *
 * The id is minted here, as a uuid, and is the movie's id on the server too —
 * the server takes the device's id so a movie keeps one identity from the
 * moment it exists. Subtitles start off (MOV-9: opt-in), matching the server.
 */
function createDraft(
  {
    id,
    snapIds,
    title,
    arranger,
    style,
    bgm,
    createdAt,
  }: Required<Pick<CreateMovieInput, 'snapIds' | 'createdAt' | 'id'>> &
    Pick<CreateMovieInput, 'title' | 'arranger' | 'style' | 'bgm'>,
  existing: readonly Movie[],
): Movie {
  return {
    id,
    title: movieTitle(title, createdAt, new Set(existing.map((movie) => movie.title))),
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
    snapRefs: snapIds.map((snapId, order) => ({ snapId, order })),
    style: style ?? DefaultMovieStyle,
    bgm: bgm ?? DefaultMovieBgm,
    captions: false,
    ratio: '9:16',
    arranger: arranger ?? 'user',
  };
}

/**
 * Strips every reference to the given snaps from a movie.
 *
 * Remaining references keep their `order` values (gaps are fine, order is only
 * ever read as a sort key). Movies that reference none of the snaps are returned
 * unchanged so their identity survives and their consumers do not re-render.
 *
 * The render's source snapshot follows the same rule as the live list: a
 * deleted original may not be referenced anywhere, so restoring the render's
 * composition can never resurrect a cut with nothing to play — and a deletion
 * alone never reads as a drift the user could undo.
 */
function withoutSnaps(movie: Movie, removedSnapIds: ReadonlySet<string>): Movie {
  const snapRefs = movie.snapRefs.filter((ref) => !removedSnapIds.has(ref.snapId));
  const sourceRefs = movie.render?.snapRefs;
  const keptSourceRefs = sourceRefs?.filter((ref) => !removedSnapIds.has(ref.snapId));
  const cutsChanged = snapRefs.length !== movie.snapRefs.length;
  const sourceChanged =
    sourceRefs !== undefined &&
    keptSourceRefs !== undefined &&
    keptSourceRefs.length !== sourceRefs.length;
  if (!cutsChanged && !sourceChanged) return movie;
  return {
    ...movie,
    snapRefs: cutsChanged ? snapRefs : movie.snapRefs,
    ...(sourceChanged ? { render: { ...movie.render!, snapRefs: keptSourceRefs } } : null),
  };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

const EmptySync = { pending: {}, pendingDeletes: [], versions: {}, hasSynced: false };

export const useMovieStore = create<MovieState>()(
  persist(
    (set, get) => ({
      movies: [],
      ...EmptySync,
      hasHydrated: false,
      createMovie: ({
        id = randomUuid(),
        snapIds,
        title,
        arranger,
        style,
        bgm,
        createdAt = Date.now(),
      }) => {
        const movie = createDraft(
          { id, snapIds, title, arranger, style, bgm, createdAt },
          get().movies,
        );
        set((state) => ({
          movies: [...state.movies, movie],
          pending: { ...state.pending, [movie.id]: 'create' },
          versions: { ...state.versions, [movie.id]: 1 },
        }));
        return movie;
      },
      updateMovieCuts: (movieId, snapRefs, updatedAt = Date.now()) =>
        set((state) => editMovie(state, movieId, (movie) => ({ ...movie, snapRefs, updatedAt }))),
      updateMovieStyle: (movieId, patch, updatedAt = Date.now()) =>
        set((state) =>
          editMovie(state, movieId, (movie) => {
            const next = { ...movie, ...patch, updatedAt };
            const changed =
              next.style !== movie.style ||
              next.bgm !== movie.bgm ||
              next.captions !== movie.captions;
            return changed ? next : movie;
          }),
        ),
      setMovieArranger: (movieId, arranger, updatedAt = Date.now()) =>
        set((state) =>
          editMovie(state, movieId, (movie) =>
            movie.arranger === arranger ? movie : { ...movie, arranger, updatedAt },
          ),
        ),
      renameMovie: (movieId, title, updatedAt = Date.now()) =>
        set((state) =>
          editMovie(state, movieId, (movie) => {
            // The naming rule lives in one place, so a rename lands under the
            // same cap and the same blank-means-the-date default as a creation.
            const taken = new Set(
              state.movies.filter((other) => other.id !== movieId).map((other) => other.title),
            );
            const next = movieTitle(title, movie.createdAt, taken);
            return next === movie.title ? movie : { ...movie, title: next, updatedAt };
          }),
        ),
      // A movie the server never heard of is simply dropped; one it holds is
      // owed a delete. Either way it leaves the screen at once.
      deleteMovie: (movieId) =>
        set((state) => {
          if (!state.movies.some((movie) => movie.id === movieId)) return state;
          const neverSent = state.pending[movieId] === 'create';
          return {
            movies: state.movies.filter((movie) => movie.id !== movieId),
            pending: withoutKey(state.pending, movieId),
            versions: withoutKey(state.versions, movieId),
            pendingDeletes: neverSent
              ? state.pendingDeletes
              : [...state.pendingDeletes.filter((id) => id !== movieId), movieId],
          };
        }),
      // Not an edit the server has to hear about: the run was queued on the
      // server, which already moved the movie to `generating` itself.
      beginMovieJob: (movieId, jobId, startedAt = Date.now()) =>
        set((state) =>
          patchMovie(state, movieId, (movie) => ({
            ...movie,
            status: 'generating',
            // A retry replaces the previous attempt outright: its render is stale
            // and its error is answered by running again.
            job: { id: jobId, progress: 0, startedAt },
            render: undefined,
            error: undefined,
            errorDetail: undefined,
            finishedAt: undefined,
            updatedAt: startedAt,
          })),
        ),
      // Deliberately does not stamp `updatedAt`: the studio board sorts by it,
      // and a job would otherwise reshuffle the board at every milestone.
      advanceMovieJob: (movieId, progress, step) =>
        set((state) =>
          patchMovie(state, movieId, (movie) => {
            if (!movie.job || movie.status !== 'generating') return movie;
            // Progress never goes backwards: the socket sends a snapshot on
            // connect, so a reconnect mid-run would otherwise rewind the ring.
            const next = Math.max(movie.job.progress ?? 0, progress);
            const nextStep = step ?? movie.job.step;
            if (next === movie.job.progress && nextStep === movie.job.step) return movie;
            return { ...movie, job: { ...movie.job, progress: next, step: nextStep } };
          }),
        ),
      completeMovieJob: (movieId, render, updatedAt = Date.now()) =>
        set((state) =>
          patchMovie(state, movieId, (movie) =>
            movie.status === 'generating'
              ? {
                  ...movie,
                  status: 'ready',
                  // The render remembers what it was made from: the cut list as
                  // the job ends (a mid-job deletion has already stripped its
                  // refs by now) and the preset it was made with. Frozen here
                  // rather than by the caller so no runner can finish a job into
                  // a render that cannot say.
                  render: {
                    ...render,
                    style: movie.style,
                    snapRefs: [...movie.snapRefs].sort((left, right) => left.order - right.order),
                  },
                  job: undefined,
                  settledJobId: movie.job?.id,
                  updatedAt,
                }
              : movie,
          ),
        ),
      // The render's cover, arriving after the fact — the download runs once the
      // movie is already `ready`, because nothing about a result may wait on
      // decoration. Guarded by `renderedAt`: a download that lands after the
      // movie was regenerated describes the render it replaced, and writing it
      // would put the old cover on the new movie. `updatedAt` is deliberately
      // left alone — a cover is not an edit, and the board sorts on it.
      setRenderThumbnail: (movieId, renderedAt, thumbnailUri) =>
        set((state) =>
          patchMovie(state, movieId, (movie) =>
            movie.render && movie.render.renderedAt === renderedAt
              ? { ...movie, render: { ...movie.render, thumbnailUri } }
              : movie,
          ),
        ),
      // One of the two other ways out of `generating`. The job is dropped but the
      // cut list and settings are left exactly as they were: recovery is running
      // the same movie again, so everything the retry needs has to survive the
      // failure. `detail` is the server's diagnostic when it sent one — worded
      // for a log, kept apart from the reason worded for the user.
      failMovieJob: (movieId, error, detail, updatedAt = Date.now()) =>
        set((state) =>
          patchMovie(state, movieId, (movie) =>
            movie.status === 'generating'
              ? {
                  ...movie,
                  status: 'failed',
                  error,
                  errorDetail: detail,
                  job: undefined,
                  settledJobId: movie.job?.id,
                  updatedAt,
                }
              : movie,
          ),
        ),
      // The user's own way out of `generating` (2026-08-13). Not a failure: the
      // run was stopped on purpose, so the movie goes back to being the draft it
      // was — the previous render and error were already dropped when the job
      // began, and nothing about a deliberate stop needs a recovery notice.
      cancelMovieJob: (movieId, updatedAt = Date.now()) =>
        set((state) =>
          patchMovie(state, movieId, (movie) =>
            movie.status === 'generating'
              ? {
                  ...movie,
                  status: 'draft',
                  job: undefined,
                  error: undefined,
                  errorDetail: undefined,
                  settledJobId: movie.job?.id,
                  updatedAt,
                }
              : movie,
          ),
        ),
      // The user took the result (MOV-17): the server deleted the file, so the
      // render goes and the movie is a draft again — the composition stays and
      // can be made again, as a new run. Applied after the server has answered,
      // so it is not an outbox write.
      finishMovie: (movieId, finishedAt) =>
        set((state) =>
          patchMovie(state, movieId, (movie) =>
            movie.status === 'generating'
              ? movie
              : { ...movie, status: 'draft', render: undefined, finishedAt, updatedAt: finishedAt },
          ),
        ),
      removeSnapsEverywhere: (snapIds) =>
        set((state) => {
          const removed = new Set(snapIds);
          if (removed.size === 0) return state;
          let pending = state.pending;
          let versions = state.versions;
          const movies = state.movies.map((movie) => {
            const next = withoutSnaps(movie, removed);
            // Only a live-list change is an edit the server must hear about; a
            // render snapshot is this device's own record.
            if (next !== movie && next.snapRefs !== movie.snapRefs) {
              pending = { ...pending, [movie.id]: pending[movie.id] ?? 'update' };
              versions = { ...versions, [movie.id]: (versions[movie.id] ?? 0) + 1 };
            }
            return next;
          });
          return { movies, pending, versions };
        }),
      applyRemoteMovies: (remote) =>
        set((state) => ({
          movies: mergeRemoteMovies(state.movies, remote, {
            pending: state.pending,
            deletes: state.pendingDeletes,
          }),
          // A delete owed for a movie the server no longer has is settled.
          pendingDeletes: state.pendingDeletes.filter((id) =>
            remote.some((record) => record.id === id),
          ),
          hasSynced: true,
        })),
      // The server's answer to a create or update. Its copy is taken over the
      // local one — the server may have re-sorted an `ai` movie, or marked a
      // cut unavailable — unless an edit landed while the request was out, in
      // which case the movie stays pending and the next send carries it.
      markMovieSent: (movieId, remote, version) =>
        set((state) => {
          const current = state.movies.find((movie) => movie.id === movieId);
          if (!current) return state;
          if ((state.versions[movieId] ?? 0) !== version) {
            return { pending: { ...state.pending, [movieId]: 'update' } };
          }
          return {
            movies: state.movies.map((movie) =>
              movie.id === movieId ? movieFromRemote(remote, movie) : movie,
            ),
            pending: withoutKey(state.pending, movieId),
          };
        }),
      // The server does not have this movie any more (deleted from another
      // device, or purged): what the device holds describes nothing.
      markMovieGone: (movieId) =>
        set((state) => ({
          movies: state.movies.filter((movie) => movie.id !== movieId),
          pending: withoutKey(state.pending, movieId),
          versions: withoutKey(state.versions, movieId),
        })),
      markMovieDeleteSent: (movieId) =>
        set((state) => ({
          pendingDeletes: state.pendingDeletes.filter((id) => id !== movieId),
        })),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: MovieStoreName,
      storage: createJSONStorage(() => localStore),
      partialize: (state) => ({
        movies: state.movies,
        pending: state.pending,
        pendingDeletes: state.pendingDeletes,
        versions: state.versions,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      // The account owns its movies, so nothing is read before one is known.
      skipHydration: true,
      // v1 (2026-09-12): movies moved to the server. Movies stored by an
      // account-blind local build have ids the server will not take and were
      // never sent; by decision they are not migrated — the file starts over.
      version: 1,
      migrate: (persisted, version) =>
        version < 1 ? { movies: [], ...EmptySync } : (persisted as Partial<MovieState>),
    },
  ),
);

/**
 * Points the movie shelf at the signed-in account's movies, and empties it when
 * nobody is signed in. Called by `_app/providers` as the session user changes;
 * `useMoviesHydrated` stays false until the new owner's movies are back, and
 * `hasSynced` goes back to false so the worker reads the server for the newcomer.
 */
export const applyMovieScope = createScopedPersistence(useMovieStore, MovieStoreName, () => ({
  movies: [],
  ...EmptySync,
  hasHydrated: false,
}));

/** Drops an account's movies. For an account that is not coming back. */
export function purgeMovieScope(scope: string): Promise<void> {
  return deleteScopedState(MovieStoreName, scope);
}

/** Every movie, in storage order. Presentation order is the shelf's decision. */
export function useMovies(): Movie[] {
  return useMovieStore((state) => state.movies);
}

export function useMovieById(id: string | undefined): Movie | undefined {
  return useMovieStore((state) => (id ? state.movies.find((movie) => movie.id === id) : undefined));
}

export function useMoviesHydrated(): boolean {
  return useMovieStore((state) => state.hasHydrated);
}

/** Whether the server's movies have been read at least once for this account. */
export function useMoviesSynced(): boolean {
  return useMovieStore((state) => state.hasSynced);
}

/** The outbox, reactively — the sync worker's trigger. */
export function useMovieOutbox(): { pending: Record<string, PendingWrite>; deletes: string[] } {
  const pending = useMovieStore((state) => state.pending);
  const deletes = useMovieStore((state) => state.pendingDeletes);
  return { pending, deletes };
}

/**
 * Non-reactive read of a movie by id, for an imperative action (the compose
 * flow) that reads the current movie at call time rather than subscribing.
 */
export function getMovieById(id: string): Movie | undefined {
  return useMovieStore.getState().movies.find((movie) => movie.id === id);
}

/** Non-reactive reads and writes for the sync worker's drain loop. */
export function getMovieOutbox(): {
  pending: Record<string, PendingWrite>;
  deletes: string[];
  versions: Record<string, number>;
} {
  const { pending, pendingDeletes, versions } = useMovieStore.getState();
  return { pending, deletes: pendingDeletes, versions };
}

export function applyRemoteMovies(remote: readonly RemoteMovie[]): void {
  useMovieStore.getState().applyRemoteMovies(remote);
}

export function markMovieSent(movieId: string, remote: RemoteMovie, version: number): void {
  useMovieStore.getState().markMovieSent(movieId, remote, version);
}

export function markMovieGone(movieId: string): void {
  useMovieStore.getState().markMovieGone(movieId);
}

export function markMovieDeleteSent(movieId: string): void {
  useMovieStore.getState().markMovieDeleteSent(movieId);
}

/**
 * Starts a movie from picked snaps and returns it, so the caller can open the
 * screen on the movie it just made. Never idempotent — asking twice means the
 * user wanted two movies.
 */
export function useCreateMovie(): (input: CreateMovieInput) => Movie {
  return useMovieStore((state) => state.createMovie);
}

/**
 * Replaces a movie's whole cut list in one write. Membership, order, and trim
 * are edited together in the movie screen's cut list, and committing them
 * separately would let a movie exist in a half-applied state between writes.
 */
export function useUpdateMovieCuts(): (
  movieId: string,
  snapRefs: SnapRef[],
  updatedAt?: number,
) => void {
  return useMovieStore((state) => state.updateMovieCuts);
}

/**
 * Writes one or more generation settings. Separate from the cut list because the
 * two are edited on different steps of the wizard and a movie is legible with
 * either one changed alone.
 */
export function useUpdateMovieStyle(): (
  movieId: string,
  patch: MovieStylePatch,
  updatedAt?: number,
) => void {
  return useMovieStore((state) => state.updateMovieStyle);
}

/**
 * Records who owns the cut order. Separate from the cut list because handing
 * arrangement back to the AI changes no cut, and rearranging by hand changes no
 * setting — the two writes answer different questions.
 */
export function useSetMovieArranger(): (
  movieId: string,
  arranger: MovieArranger,
  updatedAt?: number,
) => void {
  return useMovieStore((state) => state.setMovieArranger);
}

/**
 * Renames a movie, through the same rule that named it: over-long titles are cut
 * and a blank one becomes the day the movie was started.
 */
export function useRenameMovie(): (movieId: string, title: string, updatedAt?: number) => void {
  return useMovieStore((state) => state.renameMovie);
}

/**
 * Hands a movie to the run the backend has queued, named by its `jobId`. The four
 * job actions are the movie's generation lifecycle, and each is a distinct
 * transition — starting discards a previous attempt, advancing is a progress
 * report, and completing or failing are the two ways out of `generating`.
 *
 * The caller queues the run first and passes the id it was given: a movie may
 * only enter `generating` once there is a real run to follow, or the screen would
 * show a job nothing can report on.
 */
export function useBeginMovieJob(): (movieId: string, jobId: string, startedAt?: number) => void {
  return useMovieStore((state) => state.beginMovieJob);
}

/**
 * Records a progress report from the backend. Never moves backwards and never
 * unsets a step, so a socket's on-connect snapshot cannot rewind a running job.
 */
export function useAdvanceMovieJob(): (movieId: string, progress: number, step?: string) => void {
  return useMovieStore((state) => state.advanceMovieJob);
}

/**
 * Completes a running job: the render lands and the movie becomes `ready`.
 *
 * "Complete", not "finish" — *finishing* a movie is the user's own act of taking
 * the result (`useFinishMovie`, MOV-17), which this is not.
 */
export function useCompleteMovieJob(): (
  movieId: string,
  render: MovieRender,
  updatedAt?: number,
) => void {
  return useMovieStore((state) => state.completeMovieJob);
}

export function useSetRenderThumbnail(): (
  movieId: string,
  renderedAt: number,
  thumbnailUri: string,
) => void {
  return useMovieStore((state) => state.setRenderThumbnail);
}

/**
 * Ends a running job without a render, recording why. The message is what the
 * recovery UI shows, so it is written for the user rather than for a log.
 */
export function useFailMovieJob(): (
  movieId: string,
  error: string,
  detail?: string,
  updatedAt?: number,
) => void {
  return useMovieStore((state) => state.failMovieJob);
}

/**
 * Ends a running job because the user asked it to stop. The movie returns to
 * `draft` — a deliberate stop is not a failure, and everything a re-run needs
 * (cuts, settings) is exactly as it was.
 */
export function useCancelMovieJob(): (movieId: string, updatedAt?: number) => void {
  return useMovieStore((state) => state.cancelMovieJob);
}

/**
 * Records that the user finished the movie — took the result and confirmed so —
 * after the server has deleted the file. The render goes; the movie stays a
 * draft to make again.
 */
export function useFinishMovie(): (movieId: string, finishedAt: number) => void {
  return useMovieStore((state) => state.finishMovie);
}

export function useDeleteMovie(): (movieId: string) => void {
  return useMovieStore((state) => state.deleteMovie);
}

/**
 * Drops the given snaps from every movie that references them. This is the movie
 * half of deleting an original: the snap no longer exists, so no movie may keep
 * pointing at it. A movie that loses its last cut is kept — an empty draft is
 * still the user's, and deleting it is a separate, deliberate action.
 */
export function useRemoveSnapsEverywhere(): (snapIds: readonly string[]) => void {
  return useMovieStore((state) => state.removeSnapsEverywhere);
}
