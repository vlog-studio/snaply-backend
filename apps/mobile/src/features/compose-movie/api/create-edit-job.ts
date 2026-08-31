import { z } from 'zod';

import { movieStyleOrDefault, type MovieStyle } from '@/entities/movie';
import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/**
 * The app's styles as the backend names its editing presets.
 *
 * This table is the whole reason `MovieStyle` may stay English (see its own
 * doc comment): the correspondence is one-to-one, and it lives at the API
 * boundary so a preset renamed on the server moves one line. The literals are
 * checked against the generated spec at the `apiRequest` call below — a value
 * the enum does not have is a compile error here, not a 400 at runtime.
 */
const StylePresets: Record<MovieStyle, '감성' | '여행' | '일상'> = {
  emotional: '감성',
  travel: '여행',
  daily: '일상',
};

/**
 * The shape and the ratio the render is asked for.
 *
 * Sent explicitly even though these are the server's own defaults: the app makes
 * vertical short-form and nothing else, and depending on the default would hand
 * the app's output ratio to whoever next edits the backend's profile table.
 *
 * `fitMode` decides what fills the canvas beside a clip that is not 9:16 —
 * `blur_background` puts a blurred copy of the clip there, `contain` black bars.
 * Kept at the server's `blur_background` until the product decision is made
 * (see the movie feature document); it only shows on a landscape snap.
 */
const OutputProfile = 'short_vertical';
const FitMode = 'blur_background';

/**
 * One cut of the run: the snap's id on the server, plus the window of it to use.
 *
 * The trim is carried in **seconds**, the unit the app trims in, and converted
 * where the request is built — so the wire's milliseconds live in this file only.
 * An absent `trim` means the cut plays whole, which is the same single
 * representation the movie store keeps (`withTrim` drops a full-width window).
 */
export type EditJobClip = {
  videoId: string;
  trim?: { startSec: number; endSec: number };
};

export type CreateEditJobInput = {
  /**
   * The cuts, **in cut order** — the backend renders them in the order they
   * arrive (its `fetch_source_keys` is explicit about it), which is the only
   * channel the app has for the order the user settled on.
   *
   * Must not be empty: the endpoint requires exactly one of `clips` and
   * `videoIds`, and the generated body type cannot express that (`oneOf` widens
   * both fields to optional), so an empty list would compile and 400.
   */
  clips: readonly EditJobClip[];
  style: MovieStyle;
};

const jobStartSchema = z.object({ jobId: z.string() });

/**
 * The wire form of a cut. The window goes as integer milliseconds, which loses
 * nothing: a trim lands on a multiple of `CutTrimStepSec` (0.1s) and is stored
 * rounded to the millisecond, so every window the app holds is a whole number of
 * them.
 */
function toWireClip(clip: EditJobClip) {
  if (!clip.trim) return { videoId: clip.videoId };
  return {
    videoId: clip.videoId,
    startMs: Math.round(clip.trim.startSec * 1000),
    endMs: Math.round(clip.trim.endSec * 1000),
  };
}

async function createFromApi(input: CreateEditJobInput, signal?: AbortSignal): Promise<string> {
  const { jobId } = await apiRequest('/edit-jobs', {
    method: 'POST',
    body: {
      clips: input.clips.map(toWireClip),
      stylePreset: StylePresets[movieStyleOrDefault(input.style)],
      outputProfile: OutputProfile,
      fitMode: FitMode,
    },
    schema: jobStartSchema,
    signal,
  });
  return jobId;
}

function createMock(input: CreateEditJobInput): Promise<string> {
  if (__DEV__) {
    console.log(`[compose-movie][mock] edit job queued for ${input.clips.length} cuts`);
  }
  return Promise.resolve(`mock-job-${Date.now()}`);
}

/**
 * Queue a generation run (`POST /edit-jobs`) and return the server's job id.
 *
 * The endpoint takes the cuts with their trim windows, a style preset, and the
 * output shape; a movie's BGM choice and title do not travel with it — see the
 * movie feature document for what that means on screen. The spec has since
 * gained a `subtitles` flag (default false) that this call does not send yet,
 * so `Movie.captions` still decides nothing. It refuses two ways: a `403` for
 * a video that is not the caller's, is not `ready`, or is itself a generated
 * result — every cause there shares one code and differs only in the message,
 * so the message is what the user is shown — and a `402 INSUFFICIENT_CREDITS`
 * when the run's 100-credit reservation does not fit the balance, carrying
 * `error.required`/`error.balance` (read by `readCreditShortfall`). The
 * reservation is refunded automatically when a run fails or is cancelled.
 *
 * Routes to the mock until an API origin is configured.
 */
export function createEditJob(input: CreateEditJobInput, signal?: AbortSignal): Promise<string> {
  return USE_MOCK_API ? createMock(input) : createFromApi(input, signal);
}
