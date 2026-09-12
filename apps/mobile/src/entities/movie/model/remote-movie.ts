import type { MovieArranger, MovieStatus, MovieStyle, SnapRef } from './movie';

/**
 * A movie as the server holds it, already in the app's own terms.
 *
 * Distinct from {@link Movie} on purpose: the server has no render file
 * location, no job progress, no failure wording, no cover image — those are
 * facts this device learns by following a run, and a read-back must not erase
 * them. `mergeRemoteMovies` (`lib/movie-sync`) is where one of these meets the
 * local movie and the two become the movie the screens draw.
 *
 * The cut list is in play order, each cut carrying the server's `videoId` and,
 * when the upload state can name it, the local `snapId` it stands for.
 */
export type RemoteMovie = {
  id: string;
  title: string;
  status: MovieStatus;
  style: MovieStyle;
  captions: boolean;
  ratio: '9:16';
  arranger: MovieArranger;
  snapRefs: SnapRef[];
  /** The live result's id on the server, `undefined` when there is none. */
  resultVideoId?: string;
  /** The run that made (or is making) the result, `undefined` when there is none. */
  jobId?: string;
  finishedAt?: number;
  createdAt: number;
  updatedAt: number;
};
