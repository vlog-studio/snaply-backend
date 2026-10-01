import { z } from 'zod';

import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { MovieStyle, SnapRef } from '../model/movie';
import { MovieSnapLimit } from '../model/movie';
import { StylePresets } from './movie.dto';

/**
 * One snap handed to the edit draft: one the server has (`videoId`), or one
 * still on its way up, known only by this device's id and when it was shot.
 */
export type MovieDraftSnap = { videoId: string } | { localId: string; capturedAt: number };

/**
 * A cut of the proposal, in play order. An uploaded cut carries the window the
 * draft chose (none means the whole snap); a cut not yet uploaded plays whole.
 */
export type MovieDraftCut =
  { videoId: string; trim?: NonNullable<SnapRef['trim']> } | { localId: string };

/**
 * What `POST /movie-drafts` proposes (root docs/specs/movie.md MOV-21). A
 * proposal, not a movie: the caller builds the movie from it.
 */
export type MovieDraftProposal = {
  cuts: MovieDraftCut[];
  /** Snaps handed over but not put in, in capture order. */
  leftOut: MovieDraftSnapKey[];
};

export type MovieDraftSnapKey = { videoId: string } | { localId: string };

const snapKeySchema = z.union([
  z.object({ videoId: z.string() }),
  z.object({ localId: z.string() }),
]);

const movieDraftDtoSchema = z.object({
  cuts: z.array(
    z.union([
      z.object({
        videoId: z.string(),
        startMs: z.number().optional(),
        endMs: z.number().optional(),
      }),
      z.object({ localId: z.string() }),
    ]),
  ),
  excluded: z.array(snapKeySchema),
});
type MovieDraftDto = z.infer<typeof movieDraftDtoSchema>;

function mapDraft(dto: MovieDraftDto): MovieDraftProposal {
  return {
    cuts: dto.cuts.map((cut): MovieDraftCut => {
      if (!('videoId' in cut)) return { localId: cut.localId };
      // A window round-trips only whole, as on a movie read back (`mapRemoteMovie`).
      if (cut.startMs === undefined || cut.endMs === undefined) return { videoId: cut.videoId };
      return {
        videoId: cut.videoId,
        trim: { startSec: cut.startMs / 1000, endSec: cut.endMs / 1000 },
      };
    }),
    leftOut: dto.excluded,
  };
}

/**
 * The mock server's draft: the snaps in the order sent, the first
 * {@link MovieSnapLimit} put in whole and the rest left out. It chooses
 * nothing — it has no signals — but it answers in the real shape, so the
 * screens walk the same path.
 */
function mockDraft(snaps: readonly MovieDraftSnap[]): MovieDraftDto {
  const key = (snap: MovieDraftSnap) =>
    'videoId' in snap ? { videoId: snap.videoId } : { localId: snap.localId };
  return {
    cuts: snaps.slice(0, MovieSnapLimit).map(key),
    excluded: snaps.slice(MovieSnapLimit).map(key),
  };
}

/**
 * Ask the server to pick, order, and trim the handed-over snaps
 * (`POST /movie-drafts`). Answered within the request — the server keeps no
 * one waiting on analysis — and free; the server caps how many snaps and how
 * many drafts a day, and its refusals come back as `ApiError`
 * (`TOO_MANY_SNAPS` with `max`, `DRAFT_LIMIT`).
 *
 * Send the snaps in capture order: the server sorts them itself, but the mock
 * build keeps the order it is given.
 */
export async function requestMovieDraft(
  snaps: readonly MovieDraftSnap[],
  style: MovieStyle,
  signal?: AbortSignal,
): Promise<MovieDraftProposal> {
  if (USE_MOCK_API) return mapDraft(mockDraft(snaps));
  const dto = await apiRequest('/movie-drafts', {
    method: 'POST',
    body: {
      stylePreset: StylePresets[style],
      snaps: snaps.map((snap) =>
        'videoId' in snap
          ? { videoId: snap.videoId }
          : { localId: snap.localId, capturedAt: new Date(snap.capturedAt).toISOString() },
      ),
    },
    schema: movieDraftDtoSchema,
    signal,
  });
  return mapDraft(dto);
}
