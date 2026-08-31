import { act, renderHook } from '@testing-library/react-native';

import type { Movie } from '@/entities/movie';
import { ApiError } from '@/shared/api';

import { useComposeMovie } from './use-compose-movie';

const mockCreateMovie = jest.fn();
const mockUpdateMovieCuts = jest.fn();
const mockUpdateMovieStyle = jest.fn();
const mockBeginMovieJob = jest.fn();
const mockSetMovieArranger = jest.fn();
const mockGetMovieById = jest.fn<Movie | undefined, [string]>();
const mockSnapIndex = jest.fn<[string, { capturedAt: number }][], []>();
const mockSyncEntries = jest.fn<Record<string, { status: string; videoId?: string }>, []>();
const mockCreateEditJob = jest.fn();
const mockCancelEditJob = jest.fn();
const mockCancelMovieJob = jest.fn();

// Mock each dependency at its slice Public API so the test stays at the seam.
jest.mock('@/entities/movie', () => {
  // The arrangement predicates are the entity's own and tested there; this suite
  // is about which of them the rules apply and what they then write.
  const arrangement = jest.requireActual('@/entities/movie/lib/movie-arrangement');
  return {
    MovieSnapLimit: 10,
    getMovieById: (id: string) => mockGetMovieById(id),
    isAiArranged: arrangement.isAiArranged,
    sameArrangement: arrangement.sameArrangement,
    useCreateMovie: () => mockCreateMovie,
    useUpdateMovieCuts: () => mockUpdateMovieCuts,
    useUpdateMovieStyle: () => mockUpdateMovieStyle,
    useSetMovieArranger: () => mockSetMovieArranger,
    useBeginMovieJob: () => mockBeginMovieJob,
    useCancelMovieJob: () => mockCancelMovieJob,
  };
});
jest.mock('@/entities/snap', () => ({
  useSnapIndex: () => new Map(mockSnapIndex()),
  getSnapSyncEntries: () => mockSyncEntries(),
}));
jest.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock('../api/create-edit-job', () => ({
  createEditJob: (...args: unknown[]) => mockCreateEditJob(...args),
}));
jest.mock('../api/cancel-edit-job', () => ({
  cancelEditJob: (...args: unknown[]) => mockCancelEditJob(...args),
}));

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
    snapRefs: [
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1 },
    ],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSnapIndex.mockReturnValue([
    ['s1', { capturedAt: 100 }],
    ['s2', { capturedAt: 200 }],
  ]);
  mockGetMovieById.mockReturnValue(makeMovie());
  // Both cuts have reached the backend, which is what a run needs.
  mockSyncEntries.mockReturnValue({
    s1: { status: 'uploaded', videoId: 'v1' },
    s2: { status: 'uploaded', videoId: 'v2' },
  });
  mockCreateEditJob.mockResolvedValue('job-1');
});

describe('startMovieFromSnaps', () => {
  it('creates a user-arranged draft from the picks in pick order', async () => {
    const created = makeMovie({ id: 'new' });
    mockCreateMovie.mockReturnValue(created);
    const { result } = await renderHook(() => useComposeMovie());

    let movie;
    await act(async () => {
      movie = result.current.startMovieFromSnaps(['s3', 's1']);
    });

    expect(mockCreateMovie).toHaveBeenCalledWith({ snapIds: ['s3', 's1'], arranger: 'user' });
    expect(movie).toBe(created);
  });

  it('makes nothing from no picks', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let movie;
    await act(async () => {
      movie = result.current.startMovieFromSnaps([]);
    });

    expect(movie).toBeUndefined();
    expect(mockCreateMovie).not.toHaveBeenCalled();
  });

  it('refuses a batch past the movie cap whole rather than truncating it', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let movie;
    await act(async () => {
      movie = result.current.startMovieFromSnaps(
        Array.from({ length: 11 }, (_, index) => `s${index}`),
      );
    });

    expect(movie).toBeUndefined();
    expect(mockCreateMovie).not.toHaveBeenCalled();
  });
});

describe('startMovieFromTemplate', () => {
  it('creates an AI-arranged movie with the template’s look', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.startMovieFromTemplate({
        snapIds: ['s2', 's1'],
        style: 'travel',
        bgm: 'sunny-side',
      });
    });

    expect(mockCreateMovie).toHaveBeenCalledWith({
      snapIds: ['s2', 's1'],
      style: 'travel',
      bgm: 'sunny-side',
      arranger: 'ai',
    });
  });

  it('makes nothing from a template with every slot empty', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let movie;
    await act(async () => {
      movie = result.current.startMovieFromTemplate({
        snapIds: [],
        style: 'daily',
        bgm: 'silence',
      });
    });

    expect(movie).toBeUndefined();
    expect(mockCreateMovie).not.toHaveBeenCalled();
  });
});

describe('saveCuts', () => {
  it('renumbers order to the list order and keeps each trim', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.saveCuts('m1', [
        { snapId: 's2', order: 7, trim: { startSec: 1, endSec: 3 } },
        { snapId: 's1', order: 3 },
      ]);
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalledWith('m1', [
      { snapId: 's2', order: 0, trim: { startSec: 1, endSec: 3 } },
      { snapId: 's1', order: 1 },
    ]);
    expect(outcome).toEqual({ cutCount: 2 });
  });

  it('refuses an empty cut list', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.saveCuts('m1', []);
    });

    expect(outcome).toEqual({ cutCount: 2, refused: 'empty' });
    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
  });

  it('refuses more cuts than a movie may hold', async () => {
    const { result } = await renderHook(() => useComposeMovie());
    const tooMany = Array.from({ length: 11 }, (_, order) => ({ snapId: `s${order}`, order }));

    let outcome;
    await act(async () => {
      outcome = result.current.saveCuts('m1', tooMany);
    });

    expect(outcome).toEqual({ cutCount: 2, refused: 'full' });
    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
  });

  it('refuses a generating movie, which a job owns right now', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'generating' }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.saveCuts('m1', [{ snapId: 's1', order: 0 }]);
    });

    expect(outcome).toEqual({ cutCount: 2, refused: 'frozen' });
    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
  });

  it('lets a draft be edited, so the composition is settled before the run', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'draft' }));
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.saveCuts('m1', [{ snapId: 's1', order: 0 }]);
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalled();
  });

  it('lets a failed movie be edited, so a broken generation can be fixed', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'failed' }));
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.saveCuts('m1', [{ snapId: 's1', order: 0 }]);
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalled();
  });

  it('takes the order off the AI when the user rearranges an AI-arranged movie', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ arranger: 'ai' }));
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.saveCuts('m1', [
        { snapId: 's2', order: 0 },
        { snapId: 's1', order: 1 },
      ]);
    });

    expect(mockSetMovieArranger).toHaveBeenCalledWith('m1', 'user');
  });

  it('leaves the AI its order when only a trim changed', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ arranger: 'ai' }));
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.saveCuts('m1', [
        { snapId: 's1', order: 0, trim: { startSec: 0.5, endSec: 2 } },
        { snapId: 's2', order: 1 },
      ]);
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalled();
    expect(mockSetMovieArranger).not.toHaveBeenCalled();
  });

  it('never writes an arranger for a movie that was already the user’s', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      result.current.saveCuts('m1', [
        { snapId: 's2', order: 0 },
        { snapId: 's1', order: 1 },
      ]);
    });

    expect(mockSetMovieArranger).not.toHaveBeenCalled();
  });
});

describe('setArranger', () => {
  it('hands the order back to the AI', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ arranger: 'user' }));
    const { result } = await renderHook(() => useComposeMovie());

    let applied;
    await act(async () => {
      applied = result.current.setArranger('m1', 'ai');
    });

    expect(applied).toBe(true);
    expect(mockSetMovieArranger).toHaveBeenCalledWith('m1', 'ai');
  });

  it('refuses a movie a job owns right now', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'generating' }));
    const { result } = await renderHook(() => useComposeMovie());

    let applied;
    await act(async () => {
      applied = result.current.setArranger('m1', 'ai');
    });

    expect(applied).toBe(false);
    expect(mockSetMovieArranger).not.toHaveBeenCalled();
  });
});

describe('appendSnaps', () => {
  it('appends after the existing cuts', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.appendSnaps('m1', ['s3']);
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalledWith('m1', [
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1 },
      { snapId: 's3', order: 2 },
    ]);
    expect(outcome).toEqual({ cutCount: 3 });
  });

  it('skips snaps the movie already holds', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.appendSnaps('m1', ['s1', 's2']);
    });

    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
    expect(outcome).toEqual({ cutCount: 2 });
  });

  it('refuses the whole batch when it would not fit', async () => {
    mockGetMovieById.mockReturnValue(
      makeMovie({
        snapRefs: Array.from({ length: 9 }, (_, order) => ({ snapId: `s${order}`, order })),
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = result.current.appendSnaps('m1', ['new-a', 'new-b']);
    });

    expect(outcome).toEqual({ cutCount: 9, refused: 'full' });
    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
  });
});

describe('saveStyle', () => {
  it('writes the settings it is given', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let applied;
    await act(async () => {
      applied = result.current.saveStyle('m1', { style: 'travel' });
    });

    expect(mockUpdateMovieStyle).toHaveBeenCalledWith('m1', { style: 'travel' });
    expect(applied).toBe(true);
  });

  it('writes the settings of a draft, so the look is settled before the run', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'draft' }));
    const { result } = await renderHook(() => useComposeMovie());

    let applied;
    await act(async () => {
      applied = result.current.saveStyle('m1', { style: 'travel' });
    });

    expect(applied).toBe(true);
    expect(mockUpdateMovieStyle).toHaveBeenCalledWith('m1', { style: 'travel' });
  });

  it('refuses a generating movie', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'generating' }));
    const { result } = await renderHook(() => useComposeMovie());

    let applied;
    await act(async () => {
      applied = result.current.saveStyle('m1', { style: 'travel' });
    });

    expect(applied).toBe(false);
    expect(mockUpdateMovieStyle).not.toHaveBeenCalled();
  });
});

describe('startGeneration', () => {
  it('hands a draft to a job', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'draft' }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
    expect(outcome).toEqual({ started: true });
  });

  it('runs a failed movie again', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'failed', error: '터졌어요' }));
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('refuses a movie with nothing to generate from', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ snapRefs: [] }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: false, refused: 'empty' });
    expect(mockBeginMovieJob).not.toHaveBeenCalled();
  });

  it('runs a finished movie again, which is what regeneration is', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: true });
    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('refuses a movie a job is already running on', async () => {
    mockGetMovieById.mockReturnValue(makeMovie({ status: 'generating' }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: false, refused: 'frozen' });
    expect(mockBeginMovieJob).not.toHaveBeenCalled();
  });

  it('arranges an AI-arranged movie by capture time before running it', async () => {
    mockGetMovieById.mockReturnValue(
      makeMovie({
        arranger: 'ai',
        // The user appended s1 after s2, but s1 was shot first.
        snapRefs: [
          { snapId: 's2', order: 0 },
          { snapId: 's1', order: 1 },
        ],
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockUpdateMovieCuts).toHaveBeenCalledWith('m1', [
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1 },
    ]);
    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('leaves a user-arranged movie in the order the user left it', async () => {
    mockGetMovieById.mockReturnValue(
      makeMovie({
        arranger: 'user',
        snapRefs: [
          { snapId: 's2', order: 0 },
          { snapId: 's1', order: 1 },
        ],
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('does not rearrange when a cut’s original is gone, which would drop it', async () => {
    mockSnapIndex.mockReturnValue([['s2', { capturedAt: 200 }]]);
    mockGetMovieById.mockReturnValue(
      makeMovie({
        arranger: 'ai',
        snapRefs: [
          { snapId: 's2', order: 0 },
          { snapId: 's1', order: 1 },
        ],
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockUpdateMovieCuts).not.toHaveBeenCalled();
    expect(mockBeginMovieJob).toHaveBeenCalledWith('m1', 'job-1');
  });

  it('refuses a movie that is gone', async () => {
    mockGetMovieById.mockReturnValue(undefined);
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('gone');
    });

    expect(outcome).toEqual({ started: false, refused: 'frozen' });
  });

  it('sends the cuts in cut order, which is the only channel the order has', async () => {
    mockGetMovieById.mockReturnValue(
      makeMovie({
        arranger: 'user',
        snapRefs: [
          { snapId: 's2', order: 0 },
          { snapId: 's1', order: 1 },
        ],
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockCreateEditJob).toHaveBeenCalledWith({
      clips: [{ videoId: 'v2' }, { videoId: 'v1' }],
      style: 'daily',
    });
  });

  // What the user shortened on the timeline is what the run renders — the trim
  // travels with the cut it belongs to, not as a separate list to line up.
  it('sends each cut’s trim window with it', async () => {
    mockGetMovieById.mockReturnValue(
      makeMovie({
        arranger: 'user',
        snapRefs: [
          { snapId: 's1', order: 0, trim: { startSec: 0.5, endSec: 2 } },
          { snapId: 's2', order: 1 },
        ],
      }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    await act(async () => {
      await result.current.startGeneration('m1');
    });

    expect(mockCreateEditJob).toHaveBeenCalledWith({
      clips: [{ videoId: 'v1', trim: { startSec: 0.5, endSec: 2 } }, { videoId: 'v2' }],
      style: 'daily',
    });
  });

  // The run is made from the server's copies, and `POST /edit-jobs` refuses the
  // whole batch when one is missing — so this is answered before the request.
  it.each([
    ['still uploading', { status: 'uploading' }],
    ['a failed upload', { status: 'failed', attempts: 1 }],
    ['never uploaded', undefined],
  ])('refuses a movie with a cut that is %s', async (_label, entry) => {
    mockSyncEntries.mockReturnValue({
      s1: { status: 'uploaded', videoId: 'v1' },
      ...(entry ? { s2: entry } : null),
    } as Record<string, { status: string; videoId?: string }>);
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: false, refused: 'uploading' });
    expect(mockCreateEditJob).not.toHaveBeenCalled();
    expect(mockBeginMovieJob).not.toHaveBeenCalled();
  });

  // Every cause of a 403 shares one code and only the message says which one it
  // was — so it is carried through rather than reworded. The fixture is the
  // server's own ownership/state sentence.
  it('reports the backend’s own words when it refuses the run', async () => {
    const reason =
      '\uD3B8\uC9D1\uD560 \uC218 \uC5C6\uB294 \uC601\uC0C1\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.';
    // 편집할 수 없는 영상이 포함되어 있습니다.
    mockCreateEditJob.mockRejectedValue(
      new ApiError('generation_rejected', reason, { status: 403 }),
    );
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: false, refused: 'rejected', message: reason });
    expect(mockBeginMovieJob).not.toHaveBeenCalled();
  });

  it('leaves the movie untouched when the request itself fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCreateEditJob.mockRejectedValue(new ApiError('network_error', 'network'));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.startGeneration('m1');
    });

    expect(outcome).toEqual({ started: false, refused: 'unreachable' });
    expect(mockBeginMovieJob).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network_error'));
    warnSpy.mockRestore();
  });
});

describe('cancelGeneration', () => {
  const startedAt = 1_754_000_000_000;
  const generating = () =>
    makeMovie({ status: 'generating', job: { id: 'job-1', progress: 40, startedAt } });

  beforeEach(() => {
    mockGetMovieById.mockReturnValue(generating());
    mockCancelEditJob.mockResolvedValue(undefined);
  });

  it('cancels the run on the server, then returns the movie to a draft', async () => {
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.cancelGeneration('m1');
    });

    expect(mockCancelEditJob).toHaveBeenCalledWith('job-1');
    expect(mockCancelMovieJob).toHaveBeenCalledWith('m1');
    expect(outcome).toEqual({ canceled: true });
  });

  // The movie may leave `generating` only on the server's word — flipping it
  // first would let a run that kept going finish into a state not expecting it.
  it('leaves the movie generating when the request itself fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCancelEditJob.mockRejectedValue(new ApiError('network_error', 'network'));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.cancelGeneration('m1');
    });

    expect(mockCancelMovieJob).not.toHaveBeenCalled();
    expect(outcome).toEqual({ canceled: false, refused: 'unreachable' });
    warnSpy.mockRestore();
  });

  // A 409 means the run ended while the request was in flight; the result is
  // already arriving through the runner, so there is nothing to change here.
  it('reports a run that finished first as settled, changing nothing', async () => {
    mockCancelEditJob.mockRejectedValue(new ApiError('CONFLICT', 'done', { status: 409 }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.cancelGeneration('m1');
    });

    expect(mockCancelMovieJob).not.toHaveBeenCalled();
    expect(outcome).toEqual({ canceled: false, refused: 'settled' });
  });

  // A job the backend has never heard of is not running — which is exactly what
  // the user asked for, so the movie goes back to a draft all the same.
  it('returns the movie to a draft when the backend has never heard of the job', async () => {
    mockCancelEditJob.mockRejectedValue(new ApiError('not_found', 'no job', { status: 404 }));
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.cancelGeneration('m1');
    });

    expect(mockCancelMovieJob).toHaveBeenCalledWith('m1');
    expect(outcome).toEqual({ canceled: true });
  });

  it.each([
    ['a movie no job owns', makeMovie({ status: 'draft' })],
    ['an unknown movie', undefined],
  ])('refuses %s without asking the server', async (_label, movie) => {
    mockGetMovieById.mockReturnValue(movie);
    const { result } = await renderHook(() => useComposeMovie());

    let outcome;
    await act(async () => {
      outcome = await result.current.cancelGeneration('m1');
    });

    expect(mockCancelEditJob).not.toHaveBeenCalled();
    expect(mockCancelMovieJob).not.toHaveBeenCalled();
    expect(outcome).toEqual({ canceled: false, refused: 'settled' });
  });
});
