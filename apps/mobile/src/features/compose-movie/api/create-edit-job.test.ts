import type { MovieStyle } from '@/entities/movie';

import { createEditJob, type EditJobClip } from './create-edit-job';

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));

const mockApiRequest = jest.fn();
jest.mock('@/shared/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

/** The body the call would send for these inputs. */
async function bodyFor(clips: EditJobClip[], style: MovieStyle) {
  mockApiRequest.mockResolvedValueOnce({ jobId: 'job-1' });
  await createEditJob({ clips, style });
  return mockApiRequest.mock.calls[0][1].body;
}

/** The cuts an id-only case needs, which most of these are. */
function cuts(...videoIds: string[]): EditJobClip[] {
  return videoIds.map((videoId) => ({ videoId }));
}

const emotional = '\uAC10\uC131'; // 감성
const travel = '\uC5EC\uD589'; // 여행
const daily = '\uC77C\uC0C1'; // 일상

describe('createEditJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the job id the server issued', async () => {
    mockApiRequest.mockResolvedValueOnce({ jobId: 'job-7' });
    await expect(createEditJob({ clips: cuts('v1'), style: 'daily' })).resolves.toBe('job-7');
  });

  it.each([
    ['emotional', emotional],
    ['travel', travel],
    ['daily', daily],
  ])('sends %s as the backend preset it maps to', async (style, preset) => {
    const body = await bodyFor(cuts('v1'), style as MovieStyle);
    expect(body.stylePreset).toBe(preset);
  });

  // A movie stored by an older build names a style this build dropped; sending
  // it would be a 400, so it goes as the default preset instead.
  it('sends the default preset for a retired style', async () => {
    const body = await bodyFor(cuts('v1'), 'calm' as MovieStyle);
    expect(body.stylePreset).toBe(daily);
  });

  // The array order is the cut order — the backend renders the clips in the
  // order they arrive, and nothing else carries the order the user settled on.
  it('sends the cuts in the order it was given them', async () => {
    const body = await bodyFor(cuts('v3', 'v1', 'v2'), 'daily');
    expect(body.clips).toEqual([{ videoId: 'v3' }, { videoId: 'v1' }, { videoId: 'v2' }]);
  });

  // `videoIds` is the endpoint's other, id-only form; the two are mutually
  // exclusive (`oneOf`), so sending both would be a 400.
  it('sends the cuts as `clips` only', async () => {
    const body = await bodyFor(cuts('v1'), 'daily');
    expect(body.videoIds).toBeUndefined();
  });

  it('sends a trimmed cut as the window in milliseconds', async () => {
    const body = await bodyFor([{ videoId: 'v1', trim: { startSec: 0.5, endSec: 2.3 } }], 'daily');
    expect(body.clips).toEqual([{ videoId: 'v1', startMs: 500, endMs: 2300 }]);
  });

  // A cut that plays whole carries no window at all, rather than one spanning
  // the snap: the app does not know the snap's length here, and `startMs`
  // defaults to 0 on the server anyway.
  it('sends no window for a cut that plays whole', async () => {
    const body = await bodyFor(cuts('v1'), 'daily');
    expect(body.clips[0]).toEqual({ videoId: 'v1' });
  });

  // The app makes vertical short-form only, and the server's defaults are its
  // own to change — so the shape is stated rather than assumed.
  it('states the output shape it wants', async () => {
    const body = await bodyFor(cuts('v1'), 'daily');
    expect(body.outputProfile).toBe('short_vertical');
    expect(body.fitMode).toBe('blur_background');
  });
});
