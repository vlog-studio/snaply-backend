import { z } from 'zod';

import { movieStyleOrDefault } from '../lib/movie-style';
import { isTransitionKind, transitionAfter } from '../lib/movie-transition';
import type { Movie, MovieStyle, SnapRef, TransitionKind } from '../model/movie';

import type { RemoteMovie } from '../model/remote-movie';

/**
 * The wire shape of a movie (`GET /movies`, `GET /movies/{id}`, and what every
 * write returns). Only the fields the app maps are declared; Zod strips the rest.
 *
 * `status`, `stylePreset`, `arranger` and `ratio` stay `string` at the boundary
 * — a value the server adds later must not fail the whole read — and are
 * narrowed in the mapper, where an unknown one falls back rather than throws.
 */
const clipDtoSchema = z.object({
  videoId: z.string(),
  startMs: z.number().optional(),
  endMs: z.number().optional(),
  // Optional: a server older than trim owners sends none, which reads as the user's.
  trimOwner: z.string().optional(),
  unavailable: z.boolean(),
  // Optional: a server older than per-boundary transitions sends none. `kind`
  // and `owner` stay strings — a kind this build has not heard of is dropped in
  // the mapper rather than failing the read.
  transition: z
    .object({ kind: z.string(), durationMs: z.number().optional(), owner: z.string() })
    .nullable()
    .optional(),
});

export const movieDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  stylePreset: z.string(),
  captions: z.boolean(),
  ratio: z.string(),
  arranger: z.string(),
  clips: z.array(clipDtoSchema),
  resultVideoId: z.string().nullable(),
  jobId: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MovieDto = z.infer<typeof movieDtoSchema>;

export const moviePageDtoSchema = z.object({
  items: z.array(movieDtoSchema),
  nextCursor: z.string().nullable(),
});

/**
 * The app's styles as the backend names its editing presets, and back.
 *
 * The correspondence is one-to-one and lives at this boundary so a preset
 * renamed on the server moves one line. The literals are checked against the
 * shared contract where the body is sent — a value the enum does not have is a
 * compile error there, not a 400 at runtime.
 */
export const StylePresets: Record<MovieStyle, '감성' | '여행' | '일상'> = {
  emotional: '감성',
  travel: '여행',
  daily: '일상',
};

const StyleByPreset: Record<string, MovieStyle> = {
  감성: 'emotional',
  여행: 'travel',
  일상: 'daily',
};

/** Who knows which local snap a server video is — the upload state, injected. */
export type SnapIdResolver = (videoId: string) => string | undefined;

/** Who knows which server video a local snap became — the upload state, injected. */
export type VideoIdResolver = (snapId: string) => string | undefined;

const MovieStatuses = ['draft', 'generating', 'ready', 'failed'] as const;

/**
 * Map one wire movie onto the app's terms.
 *
 * A cut is keyed by the local snap the resolver names, or by its server id when
 * no local snap answers to it (see `SnapRef.snapId`). The trim round-trips only
 * when both ends are present: the app trims in whole windows, and a one-sided
 * window — which nothing in this app writes — plays whole rather than guessing
 * the missing end.
 */
export function mapRemoteMovie(dto: MovieDto, snapIdOf: SnapIdResolver): RemoteMovie {
  const status = MovieStatuses.find((value) => value === dto.status) ?? 'draft';
  return {
    id: dto.id,
    title: dto.title,
    status,
    style: movieStyleOrDefault(StyleByPreset[dto.stylePreset]),
    captions: dto.captions,
    ratio: '9:16',
    arranger: dto.arranger === 'ai' ? 'ai' : 'user',
    snapRefs: dto.clips.map((clip, order) => {
      const ref: SnapRef = {
        snapId: snapIdOf(clip.videoId) ?? clip.videoId,
        order,
        videoId: clip.videoId,
      };
      if (clip.startMs !== undefined && clip.endMs !== undefined) {
        ref.trim = { startSec: clip.startMs / 1000, endSec: clip.endMs / 1000 };
      }
      if (clip.trimOwner === 'ai') ref.trimOwner = 'ai';
      if (clip.unavailable) ref.unavailable = true;
      const next = dto.clips[order + 1];
      if (clip.transition && next && isTransitionKind(clip.transition.kind)) {
        ref.transition = {
          kind: clip.transition.kind,
          ...(clip.transition.durationMs !== undefined
            ? { durationMs: clip.transition.durationMs }
            : null),
          owner: clip.transition.owner === 'user' ? 'user' : 'ai',
          toSnapId: snapIdOf(next.videoId) ?? next.videoId,
        };
      }
      return ref;
    }),
    ...(dto.resultVideoId ? { resultVideoId: dto.resultVideoId } : null),
    ...(dto.jobId ? { jobId: dto.jobId } : null),
    ...(dto.finishedAt ? { finishedAt: Date.parse(dto.finishedAt) } : null),
    createdAt: Date.parse(dto.createdAt),
    updatedAt: Date.parse(dto.updatedAt),
  };
}

/** One cut as the server takes it. */
export type MovieClipBody = {
  videoId: string;
  startMs?: number;
  endMs?: number;
  /** Sent only for a window the edit draft chose; left out, the server records the user's. */
  trimOwner?: 'ai';
  /** Sent only for a boundary the user chose; the server picks the rest. */
  transition?: { kind: TransitionKind; durationMs?: number };
};

/** What `POST /movies` and `PATCH /movies/{id}` are sent about a movie. */
export type MovieBody = {
  title: string;
  clips: MovieClipBody[];
  stylePreset: (typeof StylePresets)[MovieStyle];
  captions: boolean;
  arranger: 'user' | 'ai';
};

/**
 * The wire form of a cut. The window goes as integer milliseconds, which loses
 * nothing: a trim lands on a multiple of `CutTrimStepSec` (0.1s) and is stored
 * rounded to the millisecond, so every window the app holds is a whole number of
 * them.
 */
function toClipBody(videoId: string, ref: SnapRef): MovieClipBody {
  const owner = ref.trimOwner === 'ai' ? { trimOwner: 'ai' as const } : null;
  if (!ref.trim) return { videoId, ...owner };
  return {
    videoId,
    startMs: Math.round(ref.trim.startSec * 1000),
    endMs: Math.round(ref.trim.endSec * 1000),
    ...owner,
  };
}

/**
 * The movie as the server should hold it, or `undefined` while a cut has no
 * server id yet.
 *
 * All-or-nothing on purpose: the server takes the cut list whole, and half a
 * movie is not a movie the user made. A cut names its server video either by
 * the id it was read back with (`ref.videoId`) or by what the upload state
 * knows now; a cut with neither is a snap still on its way up, and the write
 * waits for it.
 */
export function toMovieBody(
  movie: Pick<Movie, 'title' | 'snapRefs' | 'style' | 'captions' | 'arranger'>,
  videoIdOf: VideoIdResolver,
): MovieBody | undefined {
  const ordered = [...movie.snapRefs].sort((left, right) => left.order - right.order);
  const clips: MovieClipBody[] = [];
  for (const [index, ref] of ordered.entries()) {
    const videoId = ref.videoId ?? videoIdOf(ref.snapId);
    if (!videoId) return undefined;
    const clip = toClipBody(videoId, ref);
    // Only the user's own picks travel, and only while they still lead into the
    // cut they were chosen for — a boundary left out is the server's to pick
    // (root docs/api-spec.md, 무비 · MOV-22).
    const transition = transitionAfter(ordered, index);
    if (transition?.owner === 'user') {
      clip.transition = {
        kind: transition.kind,
        ...(transition.durationMs !== undefined ? { durationMs: transition.durationMs } : null),
      };
    }
    clips.push(clip);
  }
  return {
    title: movie.title,
    clips,
    stylePreset: StylePresets[movieStyleOrDefault(movie.style)],
    captions: movie.captions,
    arranger: movie.arranger ?? 'user',
  };
}
