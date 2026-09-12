import { DefaultMovieBgm } from './movie-bgm';
import type { Movie } from '../model/movie';
import type { RemoteMovie } from '../model/remote-movie';

/** A write the server has not been told about yet. */
export type PendingWrite = 'create' | 'update';

/**
 * What the device owes the server: movies whose local state is ahead of the
 * server's (by which kind of write), and ids of movies deleted here that the
 * server still holds.
 */
export type MovieOutbox = {
  pending: Readonly<Record<string, PendingWrite>>;
  deletes: readonly string[];
};

/**
 * The movie a server record becomes on this device, keeping what only this
 * device knows about it.
 *
 * The server holds the composition and the lifecycle facts; it does not hold
 * the render file's address, the cover image, a running job's progress, or the
 * words a failure was given. Those are kept from `local` whenever they still
 * describe the same result or run, and dropped when the server names a
 * different one — a movie remade on another device must not keep playing the
 * old file.
 *
 * A result or run this device has not followed is handed to the runner: the
 * movie comes back `generating` under an *adopted* job, and the runner's
 * ordinary catch-up asks the server how that run ended and writes the render
 * or the failure exactly as it would for a run started here. One code path
 * for "learn how a run ended", instead of a second one for read-backs. A run
 * this device already settled (`settledJobId`) is not adopted again — the
 * outcome is on the movie, and re-asking would flicker it through `generating`
 * on every read.
 */
export function movieFromRemote(remote: RemoteMovie, local: Movie | undefined): Movie {
  const base: Movie = {
    id: remote.id,
    title: remote.title,
    status: 'draft',
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    snapRefs: remote.snapRefs,
    style: remote.style,
    // The server has no track field (the pipeline scores from the preset), so
    // the stored choice is this device's and is simply kept.
    bgm: local?.bgm ?? DefaultMovieBgm,
    captions: remote.captions,
    ratio: remote.ratio,
    arranger: remote.arranger,
    ...(remote.finishedAt !== undefined ? { finishedAt: remote.finishedAt } : null),
    ...(local?.settledJobId ? { settledJobId: local.settledJobId } : null),
  };

  const sameRun = local?.job !== undefined && local.job.id === remote.jobId;
  const adopt = (jobId: string): Movie => ({
    ...base,
    status: 'generating',
    job: { id: jobId, progress: 0, startedAt: remote.updatedAt, adopted: true },
  });

  // The server still describes a run this device has already settled — the
  // read raced the server's own catch-up. The outcome applied here stands.
  if (local && remote.jobId !== undefined && local.settledJobId === remote.jobId) {
    return {
      ...base,
      status: local.status === 'generating' ? 'draft' : local.status,
      ...(local.render ? { render: local.render } : null),
      ...(local.error ? { error: local.error } : null),
      ...(local.errorDetail ? { errorDetail: local.errorDetail } : null),
    };
  }

  switch (remote.status) {
    case 'generating': {
      if (!remote.jobId) return base;
      return sameRun ? { ...base, status: 'generating', job: local.job } : adopt(remote.jobId);
    }
    case 'ready': {
      // The render this device already holds for exactly this result stays,
      // cover and all; anything else is learned by following the run.
      if (local?.render && local.render.videoId === remote.resultVideoId) {
        return { ...base, status: 'ready', render: local.render };
      }
      if (remote.jobId) return adopt(remote.jobId);
      return {
        ...base,
        status: 'ready',
        ...(remote.resultVideoId
          ? {
              render: {
                videoId: remote.resultVideoId,
                renderedAt: remote.updatedAt,
                durationSec: 0,
              },
            }
          : null),
      };
    }
    case 'failed': {
      if (local?.status === 'failed') {
        return {
          ...base,
          status: 'failed',
          ...(local.error ? { error: local.error } : null),
          ...(local.errorDetail ? { errorDetail: local.errorDetail } : null),
        };
      }
      if (remote.jobId) return adopt(remote.jobId);
      return { ...base, status: 'failed' };
    }
    default:
      return base;
  }
}

/**
 * The library after a read from the server.
 *
 * The server is the source of truth for everything it has been told; the
 * outbox is the list of what it has not. So a movie with a pending write keeps
 * its local state whole — the server's copy is the one that is behind — and a
 * movie without one takes the server's, through `movieFromRemote`. A movie the
 * server does not have is gone unless it is still waiting to be created here;
 * a movie only the server has is new here. Order is the server's (most recently
 * edited first); presentation order is the shelf's decision anyway.
 */
export function mergeRemoteMovies(
  local: readonly Movie[],
  remote: readonly RemoteMovie[],
  outbox: MovieOutbox,
): Movie[] {
  const localById = new Map(local.map((movie) => [movie.id, movie]));
  const deleted = new Set(outbox.deletes);
  const merged: Movie[] = [];

  for (const record of remote) {
    // Deleted here and not yet told: the server's copy is on its way out.
    if (deleted.has(record.id)) continue;
    const mine = localById.get(record.id);
    merged.push(mine && outbox.pending[mine.id] ? mine : movieFromRemote(record, mine));
  }

  const remoteIds = new Set(remote.map((record) => record.id));
  for (const movie of local) {
    if (remoteIds.has(movie.id)) continue;
    // Not on the server yet: it is waiting for its cuts to finish uploading.
    if (outbox.pending[movie.id] === 'create') merged.push(movie);
  }

  return merged;
}
