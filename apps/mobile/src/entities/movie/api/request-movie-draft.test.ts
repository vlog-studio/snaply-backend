import { requestMovieDraft } from './request-movie-draft';

const mockApiRequest = jest.fn();

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));
jest.mock('@/shared/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

beforeEach(() => jest.clearAllMocks());

describe('requestMovieDraft', () => {
  it('sends the style as the server names it and a local snap with when it was shot', async () => {
    mockApiRequest.mockResolvedValue({ cuts: [], excluded: [] });

    await requestMovieDraft(
      [{ videoId: 'v1' }, { localId: 'snap-2', capturedAt: Date.UTC(2026, 9, 1, 9) }],
      'emotional',
    );

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/movie-drafts',
      expect.objectContaining({
        method: 'POST',
        body: {
          stylePreset: '감성', // 감성
          snaps: [{ videoId: 'v1' }, { localId: 'snap-2', capturedAt: '2026-10-01T09:00:00.000Z' }],
        },
      }),
    );
  });

  it('reads windows in seconds, plays a cut whole without both ends, and keeps what was left out', async () => {
    mockApiRequest.mockImplementation((_path, { schema }) =>
      Promise.resolve(
        schema.parse({
          stylePreset: '일상',
          cuts: [
            { videoId: 'v1', startMs: 400, endMs: 2600 },
            { videoId: 'v2', startMs: 400 },
            { localId: 'snap-3' },
          ],
          excluded: [{ videoId: 'v4' }, { localId: 'snap-5' }],
        }),
      ),
    );

    await expect(requestMovieDraft([{ videoId: 'v1' }], 'daily')).resolves.toEqual({
      cuts: [
        { videoId: 'v1', trim: { startSec: 0.4, endSec: 2.6 } },
        { videoId: 'v2' },
        { localId: 'snap-3' },
      ],
      leftOut: [{ videoId: 'v4' }, { localId: 'snap-5' }],
      // A server older than `unavailable` sends none.
      unavailable: [],
    });
  });

  it('names the snaps the server could no longer use by their server id', async () => {
    mockApiRequest.mockImplementation((_path, { schema }) =>
      Promise.resolve(
        schema.parse({
          stylePreset: '\uC77C\uC0C1',
          cuts: [{ videoId: 'v1' }],
          excluded: [],
          unavailable: [{ videoId: 'v2' }],
        }),
      ),
    );

    await expect(
      requestMovieDraft([{ videoId: 'v1' }, { videoId: 'v2' }], 'daily'),
    ).resolves.toEqual({
      cuts: [{ videoId: 'v1' }],
      leftOut: [],
      unavailable: ['v2'],
    });
  });
});
