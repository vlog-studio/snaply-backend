import { renderHook } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';
import type { Snap } from '@/entities/snap';

import { useBoardMovies, useMovieSummaries } from './use-movie-shelf';

const mockMovies = jest.fn<Movie[], []>();
const mockSnaps = jest.fn<Snap[], []>();

jest.mock('@/entities/movie', () => {
  // The trim and progress rules are the entity's own and tested there; the
  // summary is about which of them it reaches for, so they come from the real
  // modules.
  const trim = jest.requireActual('@/entities/movie/lib/movie-trim');
  const generation = jest.requireActual('@/entities/movie/lib/movie-generation');
  return {
    useMovies: () => mockMovies(),
    cutsDurationSec: trim.cutsDurationSec,
    movieJobRatio: generation.movieJobRatio,
  };
});
jest.mock('@/entities/snap', () => {
  const actual = jest.requireActual('@/entities/snap/model/snap-refs');
  return {
    snapsByRefs: actual.snapsByRefs,
    useSnapIndex: () => new Map(mockSnaps().map((snap: Snap) => [snap.id, snap])),
  };
});

function makeSnap(id: string, durationSec: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

function makeMovie(overrides: Partial<Movie> & Pick<Movie, 'id'>): Movie {
  return {
    title: '무비',
    status: 'draft',
    createdAt: 1_753_200_000_000,
    updatedAt: 1_753_200_000_000,
    snapRefs: [],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnaps.mockReturnValue([makeSnap('s1', 3), makeSnap('s2', 5), makeSnap('s3', 4)]);
  mockMovies.mockReturnValue([]);
});

describe('useMovieSummaries', () => {
  it('sums the length of the resolved snaps and samples the first cut as the cover', async () => {
    mockMovies.mockReturnValue([
      makeMovie({
        id: 'm1',
        snapRefs: [
          { snapId: 's2', order: 1 },
          { snapId: 's1', order: 0 },
        ],
      }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0]).toMatchObject({ id: 'm1', snapCount: 2, totalSec: 8 });
    // The cover frame follows cut order, not reference order.
    expect(result.current[0].coverUris).toEqual(['file:///doc/recordings/s1.mp4']);
  });

  // The grid prefers the render's own cover; the frames stay as the fallback the
  // tile drops to when the local file is gone.
  it('carries the render cover when the movie has one', async () => {
    mockMovies.mockReturnValue([
      makeMovie({
        id: 'm1',
        status: 'ready',
        snapRefs: [{ snapId: 's1', order: 0 }],
        render: {
          renderedAt: 1,
          durationSec: 3,
          thumbnailUri: 'file:///cache/movie-covers/m1-1.jpg',
        },
      }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0].coverImageUri).toBe('file:///cache/movie-covers/m1-1.jpg');
    expect(result.current[0].coverUris).toEqual(['file:///doc/recordings/s1.mp4']);
  });

  it('carries no render cover for a movie whose render never got one', async () => {
    mockMovies.mockReturnValue([
      makeMovie({ id: 'm1', status: 'ready', render: { renderedAt: 1, durationSec: 3 } }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0].coverImageUri).toBeUndefined();
  });

  it('counts a cut whose original was deleted, but cannot draw or time it', async () => {
    mockMovies.mockReturnValue([
      makeMovie({
        id: 'm1',
        snapRefs: [
          { snapId: 's1', order: 0 },
          { snapId: 'deleted', order: 1 },
        ],
      }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0]).toMatchObject({ snapCount: 2, totalSec: 3 });
    expect(result.current[0].coverUris).toHaveLength(1);
  });

  it('times a movie by what each cut actually plays, not by the whole snap', async () => {
    mockMovies.mockReturnValue([
      makeMovie({
        id: 'm1',
        snapRefs: [
          { snapId: 's2', order: 0, trim: { startSec: 1, endSec: 3.5 } },
          { snapId: 's1', order: 1 },
        ],
      }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0].totalSec).toBe(5.5);
  });

  it('reports how far a running job has come, and nothing for every other status', async () => {
    mockMovies.mockReturnValue([
      makeMovie({
        id: 'generating',
        status: 'generating',
        updatedAt: 2,
        job: { id: 'job-1', progress: 40, startedAt: 1 },
      }),
      makeMovie({ id: 'draft', updatedAt: 1 }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    // The percentage the backend last reported, as a fraction.
    expect(result.current[0].progress).toBeCloseTo(0.4);
    expect(result.current[1].progress).toBeUndefined();
  });

  it('carries the failure reason while a movie is failed, and drops it on a retry', async () => {
    mockMovies.mockReturnValue([
      makeMovie({ id: 'failed', status: 'failed', error: '원본이 사라졌어요', updatedAt: 2 }),
      // A retry keeps the last error on the movie; the card must stop reporting a
      // problem the movie is no longer in.
      makeMovie({ id: 'retried', status: 'generating', error: '원본이 사라졌어요', updatedAt: 1 }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current[0].error).toBe('원본이 사라졌어요');
    expect(result.current[1].error).toBeUndefined();
  });

  it('orders movies by the most recent edit', async () => {
    mockMovies.mockReturnValue([
      makeMovie({ id: 'old', updatedAt: 1_753_200_000_000 }),
      makeMovie({ id: 'new', updatedAt: 1_753_900_000_000 }),
    ]);

    const { result } = await renderHook(() => useMovieSummaries());

    expect(result.current.map((movie) => movie.id)).toEqual(['new', 'old']);
  });
});

describe('useBoardMovies', () => {
  it('puts everything unfinished first, failures included, then the finished ones', async () => {
    mockMovies.mockReturnValue([
      makeMovie({ id: 'ready-new', status: 'ready', updatedAt: 5 }),
      makeMovie({ id: 'draft', status: 'draft', updatedAt: 4 }),
      makeMovie({ id: 'generating', status: 'generating', updatedAt: 3 }),
      makeMovie({ id: 'failed', status: 'failed', updatedAt: 2 }),
      makeMovie({ id: 'ready-old', status: 'ready', updatedAt: 1 }),
    ]);

    const { result } = await renderHook(() => useBoardMovies());

    expect(result.current.map((movie) => movie.id)).toEqual([
      'draft',
      'generating',
      'failed',
      'ready-new',
      'ready-old',
    ]);
  });

  it('holds every movie, so an empty board means the user has none', async () => {
    const { result } = await renderHook(() => useBoardMovies());

    expect(result.current).toEqual([]);
  });
});
