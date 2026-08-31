import { act, renderHook } from '@testing-library/react-native';

import type { Movie } from './movie';
import {
  getMovieById,
  useAdvanceMovieJob,
  useBeginMovieJob,
  useCancelMovieJob,
  useCreateMovie,
  useDeleteMovie,
  useFailMovieJob,
  useFinishMovieJob,
  useSetRenderThumbnail,
  useMovieById,
  useMovies,
  useMovieStore,
  useRemoveSnapsEverywhere,
  useRenameMovie,
  useUpdateMovieCuts,
  useUpdateMovieStyle,
} from './movie-store';

// Mock the persistence backend so no native file system is touched.
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

function makeMovie(id: string, snapIds: string[]): Movie {
  return {
    id,
    title: `무비 ${id}`,
    status: 'draft',
    createdAt: 1_753_200_000_000,
    updatedAt: 1_753_200_000_000,
    snapRefs: snapIds.map((snapId, order) => ({ snapId, order })),
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
  };
}

describe('movie store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The store is a module-level singleton; reset it so tests stay independent.
    useMovieStore.setState({ movies: [] });
  });

  it('starts empty', async () => {
    const { result } = await renderHook(() => useMovies());
    expect(result.current).toEqual([]);
  });

  it('finds a movie by id, and answers undefined for an unknown one', async () => {
    useMovieStore.setState({ movies: [makeMovie('m1', ['s1'])] });

    const { result } = await renderHook(() => ({
      found: useMovieById('m1'),
      missing: useMovieById('nope'),
      noId: useMovieById(undefined),
    }));

    expect(result.current.found?.id).toBe('m1');
    expect(result.current.missing).toBeUndefined();
    expect(result.current.noId).toBeUndefined();
  });

  it('strips deleted snaps from every movie that references them', async () => {
    useMovieStore.setState({
      movies: [makeMovie('m1', ['s1', 's2', 's3']), makeMovie('m2', ['s2'])],
    });

    const { result } = await renderHook(() => useRemoveSnapsEverywhere());
    await act(async () => result.current(['s2']));

    const [first, second] = useMovieStore.getState().movies;
    expect(first.snapRefs.map((ref) => ref.snapId)).toEqual(['s1', 's3']);
    expect(second.snapRefs).toEqual([]);
  });

  it("strips deleted snaps from a render's source snapshot too", async () => {
    useMovieStore.setState({
      movies: [
        {
          ...makeMovie('m1', ['s1', 's3']),
          status: 'ready',
          render: {
            renderedAt: 1,
            durationSec: 9,
            snapRefs: [
              { snapId: 's1', order: 0 },
              { snapId: 's2', order: 1 },
              { snapId: 's3', order: 2 },
            ],
          },
        },
      ],
    });

    const { result } = await renderHook(() => useRemoveSnapsEverywhere());
    await act(async () => result.current(['s2']));

    // The live list held no s2, but the snapshot did — restoring it must not
    // resurrect a cut whose original is gone.
    expect(useMovieStore.getState().movies[0].render?.snapRefs).toEqual([
      { snapId: 's1', order: 0 },
      { snapId: 's3', order: 2 },
    ]);
  });

  it('keeps a movie that loses its last cut — deleting a movie is its own action', async () => {
    useMovieStore.setState({ movies: [makeMovie('m1', ['s1'])] });

    const { result } = await renderHook(() => useRemoveSnapsEverywhere());
    await act(async () => result.current(['s1']));

    expect(useMovieStore.getState().movies).toHaveLength(1);
  });

  it('leaves an unaffected movie identical, so its consumers do not re-render', async () => {
    const untouched = makeMovie('m2', ['s9']);
    useMovieStore.setState({ movies: [makeMovie('m1', ['s1']), untouched] });

    const { result } = await renderHook(() => useRemoveSnapsEverywhere());
    await act(async () => result.current(['s1']));

    expect(useMovieStore.getState().movies[1]).toBe(untouched);
  });

  it.each([[[]], [['unknown-snap']]])('leaves every movie untouched for %j', async (snapIds) => {
    const movie = makeMovie('m1', ['s1']);
    useMovieStore.setState({ movies: [movie] });

    const { result } = await renderHook(() => useRemoveSnapsEverywhere());
    await act(async () => result.current(snapIds));

    expect(useMovieStore.getState().movies[0]).toBe(movie);
  });
});

describe('creating a movie', () => {
  const createdAt = new Date(2026, 7, 3, 9).getTime();

  beforeEach(() => {
    useMovieStore.setState({ movies: [] });
  });

  it('starts a draft holding the picked snaps in the given order', async () => {
    const { result } = await renderHook(() => useCreateMovie());

    let movie: Movie | undefined;
    await act(async () => {
      movie = result.current({ snapIds: ['s3', 's1'], createdAt });
    });

    expect(movie).toMatchObject({
      status: 'draft',
      ratio: '9:16',
      createdAt,
      updatedAt: createdAt,
    });
    expect(movie?.snapRefs).toEqual([
      { snapId: 's3', order: 0 },
      { snapId: 's1', order: 1 },
    ]);
    expect(useMovieStore.getState().movies).toHaveLength(1);
  });

  it('names a movie after the day it was started, and keeps a given name', async () => {
    const { result } = await renderHook(() => useCreateMovie());

    let auto: Movie | undefined;
    let named: Movie | undefined;
    await act(async () => {
      auto = result.current({ snapIds: ['s1'], createdAt });
      named = result.current({ snapIds: ['s2'], title: '제주 이틀', createdAt });
    });

    expect(auto?.title).toBe('무비 08-03');
    expect(named?.title).toBe('제주 이틀');
  });

  it('gives two movies started in the same millisecond distinct ids and titles', async () => {
    const { result } = await renderHook(() => useCreateMovie());

    let first: Movie | undefined;
    let second: Movie | undefined;
    await act(async () => {
      first = result.current({ snapIds: ['s1'], createdAt });
      second = result.current({ snapIds: ['s2'], createdAt });
    });

    expect(second?.id).not.toBe(first?.id);
    expect(second?.title).toBe('무비 08-03 (2)');
  });

  it('reads back by id without subscribing', async () => {
    const { result } = await renderHook(() => useCreateMovie());
    let movie: Movie | undefined;
    await act(async () => {
      movie = result.current({ snapIds: ['s1'], createdAt });
    });

    expect(getMovieById(movie!.id)?.id).toBe(movie!.id);
    expect(getMovieById('nope')).toBeUndefined();
  });
});

describe('editing a movie', () => {
  beforeEach(() => {
    useMovieStore.setState({ movies: [makeMovie('m1', ['s1', 's2'])] });
  });

  it('replaces the whole cut list and stamps the edit', async () => {
    const { result } = await renderHook(() => useUpdateMovieCuts());

    await act(async () =>
      result.current('m1', [{ snapId: 's2', order: 0, trim: { startSec: 1, endSec: 3 } }], 999),
    );

    const [movie] = useMovieStore.getState().movies;
    expect(movie.snapRefs).toEqual([{ snapId: 's2', order: 0, trim: { startSec: 1, endSec: 3 } }]);
    expect(movie.updatedAt).toBe(999);
  });

  it('renames a movie', async () => {
    const { result } = await renderHook(() => useRenameMovie());

    await act(async () => result.current('m1', '제주 이틀', 999));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      title: '제주 이틀',
      updatedAt: 999,
    });
  });

  it('renames through the naming rule, so a blank name falls back to the date', async () => {
    const { result } = await renderHook(() => useRenameMovie());

    await act(async () => result.current('m1', '   ', 999));

    // 무비 07-22 — the day makeMovie stamps as createdAt.
    expect(useMovieStore.getState().movies[0].title).toMatch(/^무비 \d\d-\d\d$/);
  });

  it('writes only the style settings it is given', async () => {
    const { result } = await renderHook(() => useUpdateMovieStyle());

    await act(async () => result.current('m1', { style: 'travel' }, 999));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      style: 'travel',
      bgm: 'lofi-walk',
      captions: true,
      updatedAt: 999,
    });
  });

  it('leaves the movie identical when a style write changes nothing', async () => {
    const before = useMovieStore.getState().movies[0];
    const { result } = await renderHook(() => useUpdateMovieStyle());

    await act(async () => result.current('m1', { style: 'daily', captions: true }, 999));

    expect(useMovieStore.getState().movies[0]).toBe(before);
  });

  it('deletes a movie', async () => {
    const { result } = await renderHook(() => useDeleteMovie());

    await act(async () => result.current('m1'));

    expect(useMovieStore.getState().movies).toEqual([]);
  });

  it.each(['updateMovieCuts', 'renameMovie', 'updateMovieStyle'] as const)(
    'ignores %s for an unknown movie',
    async (action) => {
      const before = useMovieStore.getState().movies;
      await act(async () => {
        const store = useMovieStore.getState();
        if (action === 'updateMovieCuts') store.updateMovieCuts('nope', [], 1);
        else if (action === 'renameMovie') store.renameMovie('nope', 'x', 1);
        else store.updateMovieStyle('nope', { style: 'travel' }, 1);
      });

      expect(useMovieStore.getState().movies).toBe(before);
    },
  );
});

describe('generating a movie', () => {
  const startedAt = 1_754_000_000_000;
  const render = { renderedAt: startedAt + 40_000, durationSec: 12 };
  // One of the pipeline's own milestone labels, as the backend publishes it.
  const cutStep = '\uCEF7\uD3B8\uC9D1 \uC644\uB8CC'; // 컷편집 완료

  beforeEach(() => {
    useMovieStore.setState({ movies: [makeMovie('m1', ['s1', 's2'])] });
  });

  it('starts a job under the id the backend gave it, and marks the movie generating', async () => {
    const { result } = await renderHook(() => useBeginMovieJob());

    await act(async () => result.current('m1', 'job-abc', startedAt));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      status: 'generating',
      job: { id: 'job-abc', progress: 0, startedAt },
      updatedAt: startedAt,
    });
  });

  it('discards the previous attempt when a failed movie is run again', async () => {
    useMovieStore.setState({
      movies: [{ ...makeMovie('m1', ['s1']), status: 'failed', error: '터졌어요', render }],
    });
    const { result } = await renderHook(() => useBeginMovieJob());

    await act(async () => result.current('m1', 'job-abc', startedAt));

    expect(useMovieStore.getState().movies[0]).toMatchObject({ status: 'generating' });
    expect(useMovieStore.getState().movies[0].error).toBeUndefined();
    expect(useMovieStore.getState().movies[0].render).toBeUndefined();
  });

  it('records the progress and step a running job reported, without reshuffling the board', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      advance: useAdvanceMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.advance('m1', 35, cutStep));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      job: { progress: 35, step: cutStep },
      updatedAt: startedAt,
    });
  });

  // The socket sends a snapshot on connect, so a reconnect mid-run would rewind
  // the ring if progress could move backwards.
  it('never moves progress backwards', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      advance: useAdvanceMovieJob(),
    }));
    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.advance('m1', 60, cutStep));

    await act(async () => result.current.advance('m1', 10));

    expect(useMovieStore.getState().movies[0].job).toMatchObject({ progress: 60, step: cutStep });
  });

  it('leaves the movie identical when the report says nothing new', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      advance: useAdvanceMovieJob(),
    }));
    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    const before = useMovieStore.getState().movies[0];

    await act(async () => result.current.advance('m1', 0));

    expect(useMovieStore.getState().movies[0]).toBe(before);
  });

  it('finishes a job into a ready movie holding its render', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      finish: useFinishMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.finish('m1', render, 999));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      status: 'ready',
      render,
      updatedAt: 999,
    });
    expect(useMovieStore.getState().movies[0].job).toBeUndefined();
  });

  it('freezes the cut list into the render, in stored order', async () => {
    useMovieStore.setState({
      movies: [
        {
          ...makeMovie('m1', []),
          snapRefs: [
            { snapId: 's2', order: 1 },
            { snapId: 's1', order: 0, trim: { startSec: 1, endSec: 3 } },
          ],
        },
      ],
    });
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      finish: useFinishMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.finish('m1', render, 999));

    expect(useMovieStore.getState().movies[0].render?.snapRefs).toEqual([
      { snapId: 's1', order: 0, trim: { startSec: 1, endSec: 3 } },
      { snapId: 's2', order: 1 },
    ]);
  });

  // Watch mode names the style off the render, so it has to be the preset the
  // run was made with — a finished movie's style may be changed in the studio
  // without the movie being made again.
  it('freezes the style the run was made with, and keeps it through a later change', async () => {
    useMovieStore.setState({ movies: [{ ...makeMovie('m1', ['s1']), style: 'travel' }] });
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      finish: useFinishMovieJob(),
      updateStyle: useUpdateMovieStyle(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.finish('m1', render, 999));
    await act(async () => result.current.updateStyle('m1', { style: 'emotional' }, 1_000));

    expect(useMovieStore.getState().movies[0].style).toBe('emotional');
    expect(useMovieStore.getState().movies[0].render?.style).toBe('travel');
  });

  // The cover arrives after the movie is already `ready` (the download does not
  // gate the result), so it is written by its own action — and only onto the
  // render it was made for.
  it('writes the render cover onto the render it belongs to', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      finish: useFinishMovieJob(),
      setThumbnail: useSetRenderThumbnail(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.finish('m1', render, 999));
    await act(async () =>
      result.current.setThumbnail('m1', render.renderedAt, 'file:///cover.jpg'),
    );

    expect(useMovieStore.getState().movies[0].render?.thumbnailUri).toBe('file:///cover.jpg');
    // A cover is not an edit, and the board sorts on `updatedAt`.
    expect(useMovieStore.getState().movies[0].updatedAt).toBe(999);
  });

  it('drops a cover that describes a render the movie has since replaced', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      finish: useFinishMovieJob(),
      setThumbnail: useSetRenderThumbnail(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.finish('m1', render, 999));
    const before = useMovieStore.getState().movies[0];

    await act(async () =>
      result.current.setThumbnail('m1', render.renderedAt - 1, 'file:///old.jpg'),
    );

    expect(useMovieStore.getState().movies[0]).toBe(before);
  });

  it('fails a job into a failed movie holding the reason', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      fail: useFailMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.fail('m1', '원본이 사라졌어요', '서버 진단 원문', 999));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      status: 'failed',
      error: '원본이 사라졌어요',
      errorDetail: '서버 진단 원문',
      updatedAt: 999,
    });
    expect(useMovieStore.getState().movies[0].job).toBeUndefined();
  });

  it('keeps the cut list and settings across a failure, so a retry has them', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      fail: useFailMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.fail('m1', '터졌어요'));

    expect(useMovieStore.getState().movies[0]).toMatchObject({
      snapRefs: [
        { snapId: 's1', order: 0 },
        { snapId: 's2', order: 1 },
      ],
      style: 'daily',
      bgm: 'lofi-walk',
    });
  });

  it('cancels a job back into a draft, keeping nothing of the attempt', async () => {
    const { result } = await renderHook(() => ({
      begin: useBeginMovieJob(),
      cancel: useCancelMovieJob(),
    }));

    await act(async () => result.current.begin('m1', 'job-abc', startedAt));
    await act(async () => result.current.cancel('m1', 999));

    const movie = useMovieStore.getState().movies[0];
    // A deliberate stop is not a failure: no `failed` state, no stored reason,
    // and the cuts and settings stay for the next run.
    expect(movie).toMatchObject({ status: 'draft', updatedAt: 999 });
    expect(movie.job).toBeUndefined();
    expect(movie.error).toBeUndefined();
    expect(movie.snapRefs).toEqual([
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1 },
    ]);
  });

  it.each(['advanceMovieJob', 'finishMovieJob', 'failMovieJob', 'cancelMovieJob'] as const)(
    'ignores %s for a movie no job owns',
    async (action) => {
      const before = useMovieStore.getState().movies[0];

      await act(async () => {
        const store = useMovieStore.getState();
        if (action === 'advanceMovieJob') store.advanceMovieJob('m1', 2);
        else if (action === 'finishMovieJob') store.finishMovieJob('m1', render, 999);
        else if (action === 'failMovieJob') store.failMovieJob('m1', '터졌어요', undefined, 999);
        else store.cancelMovieJob('m1', 999);
      });

      expect(useMovieStore.getState().movies[0]).toBe(before);
    },
  );
});
