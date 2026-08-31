import { act, renderHook } from '@testing-library/react-native';

import type { Movie, SnapRef } from '@/entities/movie';
import type { Snap } from '@/entities/snap';

import { useMovieCuts } from './use-movie-cuts';

const mockMovie = jest.fn<Movie | undefined, []>();
const mockSaveCuts = jest.fn();
const mockSnaps = jest.fn<Snap[], []>();

jest.mock('@/entities/movie', () => {
  // The trim and render-source rules are the entity's own and tested there;
  // this hook is about which of them it applies and what it commits.
  const trim = jest.requireActual('@/entities/movie/lib/movie-trim');
  const render = jest.requireActual('@/entities/movie/lib/movie-render');
  return {
    useMovieById: () => mockMovie(),
    cutDurationSec: trim.cutDurationSec,
    cutsDurationSec: trim.cutsDurationSec,
    sameTrimWindow: trim.sameTrimWindow,
    withTrim: trim.withTrim,
    withoutTrim: trim.withoutTrim,
    isEditedSinceRender: render.isEditedSinceRender,
    sameCuts: render.sameCuts,
  };
});
jest.mock('@/entities/snap', () => ({
  useSnapIndex: () => new Map(mockSnaps().map((snap: Snap) => [snap.id, snap])),
}));
jest.mock('@/features/compose-movie', () => ({
  // The edit-timing rule is the feature's; take the real one so this hook and the
  // commit that has the final say can never disagree about it.
  canEditMovie: jest.requireActual('@/features/compose-movie/model/use-compose-movie').canEditMovie,
  useComposeMovie: () => ({ saveCuts: mockSaveCuts }),
}));

function makeSnap(id: string, durationSec = 3): Snap {
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
      { snapId: 's3', order: 2 },
    ],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: true,
    ratio: '9:16',
    ...overrides,
  };
}

function cutIds(cuts: { ref: { snapId: string } }[]) {
  return cuts.map((cut) => cut.ref.snapId);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMovie.mockReturnValue(makeMovie());
  mockSnaps.mockReturnValue([makeSnap('s1', 3), makeSnap('s2', 5), makeSnap('s3', 4)]);
  // The write lands in the store: the movie the hook reads next holds the
  // committed refs, the way the real zustand write behaves.
  mockSaveCuts.mockImplementation((_movieId: string, refs: SnapRef[]) => {
    mockMovie.mockReturnValue(
      makeMovie({ snapRefs: refs.map((ref, order) => ({ ...ref, order })) }),
    );
    return { cutCount: refs.length };
  });
});

describe('useMovieCuts', () => {
  it('resolves the cut list in stored order and sums its length', async () => {
    mockMovie.mockReturnValue(
      makeMovie({
        snapRefs: [
          { snapId: 's3', order: 2 },
          { snapId: 's1', order: 0 },
          { snapId: 's2', order: 1 },
        ],
      }),
    );

    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
    expect(result.current.totalSec).toBe(12);
  });

  it('keeps a row whose original was deleted, so the user can remove it', async () => {
    mockSnaps.mockReturnValue([makeSnap('s1'), makeSnap('s3')]);

    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(result.current.cuts).toHaveLength(3);
    expect(result.current.cuts[1].snap).toBeUndefined();
  });

  it('commits a move through the compose feature immediately', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));

    expect(mockSaveCuts).toHaveBeenCalledWith('m1', [
      { snapId: 's2', order: 1 },
      { snapId: 's1', order: 0 },
      { snapId: 's3', order: 2 },
    ]);
    expect(cutIds(result.current.cuts)).toEqual(['s2', 's1', 's3']);
  });

  it.each([
    ['first cut up', 0, -1 as const],
    ['last cut down', 2, 1 as const],
  ])('ignores moving the %s', async (_label, index, direction) => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(index, direction));

    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('removes a cut', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.removeCut(1));

    expect(cutIds(result.current.cuts)).toEqual(['s1', 's3']);
  });

  it('refuses to remove the last cut without writing', async () => {
    mockMovie.mockReturnValue(makeMovie({ snapRefs: [{ snapId: 's1', order: 0 }] }));
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.removeCut(0));

    expect(result.current.cuts).toHaveLength(1);
    expect(result.current.refusal).toBe('empty');
    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('surfaces a refused edit and changes nothing', async () => {
    mockSaveCuts.mockReturnValue({ cutCount: 3, refused: 'frozen' });
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));

    expect(result.current.refusal).toBe('frozen');
    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
    expect(result.current.canUndo).toBe(false);
  });

  it('reports a generating movie as read-only', async () => {
    mockMovie.mockReturnValue(makeMovie({ status: 'generating' }));

    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(result.current.canEdit).toBe(false);
  });

  it.each(['draft', 'ready', 'failed'] as const)(
    'reports a %s movie as editable',
    async (status) => {
      mockMovie.mockReturnValue(makeMovie({ status }));

      const { result } = await renderHook(() => useMovieCuts('m1'));

      expect(result.current.canEdit).toBe(true);
    },
  );
});

describe('undo and redo', () => {
  it('starts with nothing to walk', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('steps an edit back by writing the list it replaced', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    expect(result.current.canUndo).toBe(true);

    await act(async () => result.current.undo());

    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('reapplies an undone edit on redo', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    await act(async () => result.current.undo());
    await act(async () => result.current.redo());

    expect(cutIds(result.current.cuts)).toEqual(['s2', 's1', 's3']);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('walks several edits in order', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1)); // s2 s1 s3
    await act(async () => result.current.removeCut(2)); // s2 s1

    await act(async () => result.current.undo());
    expect(cutIds(result.current.cuts)).toEqual(['s2', 's1', 's3']);
    await act(async () => result.current.undo());
    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
  });

  it('drops the redo trail when a new edit lands after an undo', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    await act(async () => result.current.undo());
    await act(async () => result.current.moveCut(1, 1)); // a different edit

    expect(result.current.canRedo).toBe(false);
  });

  it('does nothing at the ends of the history', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.undo());
    await act(async () => result.current.redo());

    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('drops the history when the stored cuts change from outside', async () => {
    const { result, rerender } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    expect(result.current.canUndo).toBe(true);

    // A snap deleted from the Snap tab, or snaps appended by the picker.
    mockMovie.mockReturnValue(
      makeMovie({
        snapRefs: [
          { snapId: 's2', order: 0 },
          { snapId: 's1', order: 1 },
        ],
      }),
    );
    await act(async () => rerender({}));

    expect(cutIds(result.current.cuts)).toEqual(['s2', 's1']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});

describe('the render source', () => {
  const renderSource: SnapRef[] = [
    { snapId: 's1', order: 0 },
    { snapId: 's2', order: 1 },
    { snapId: 's3', order: 2 },
  ];

  function withRender(snapRefs: SnapRef[] = renderSource): Movie {
    return makeMovie({
      snapRefs,
      render: { renderedAt: 5, durationSec: 12, snapRefs: renderSource },
    });
  }

  beforeEach(() => {
    mockMovie.mockReturnValue(withRender());
    // The store write keeps the render: an edit moves the cut list out from
    // under the render, never the render itself.
    mockSaveCuts.mockImplementation((_movieId: string, refs: SnapRef[]) => {
      mockMovie.mockReturnValue(withRender(refs.map((ref, order) => ({ ...ref, order }))));
      return { cutCount: refs.length };
    });
  });

  it('reads an untouched finished movie as unchanged', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(result.current.editedSinceRender).toBe(false);
  });

  it('flags an edit after the render, and clears the flag on restore', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    expect(result.current.editedSinceRender).toBe(true);

    await act(async () => result.current.restoreRenderCuts());

    expect(result.current.editedSinceRender).toBe(false);
    expect(cutIds(result.current.cuts)).toEqual(['s1', 's2', 's3']);
  });

  it('restores through an ordinary commit, so the restore itself can be undone', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.moveCut(0, 1));
    await act(async () => result.current.restoreRenderCuts());
    expect(result.current.canUndo).toBe(true);

    await act(async () => result.current.undo());

    expect(cutIds(result.current.cuts)).toEqual(['s2', 's1', 's3']);
    expect(result.current.editedSinceRender).toBe(true);
  });

  it('writes nothing when the cut list already matches the render', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.restoreRenderCuts());

    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('has nothing to flag or restore without a render snapshot', async () => {
    mockMovie.mockReturnValue(makeMovie({ render: { renderedAt: 5, durationSec: 12 } }));
    const { result } = await renderHook(() => useMovieCuts('m1'));

    expect(result.current.editedSinceRender).toBe(false);

    await act(async () => result.current.restoreRenderCuts());

    expect(mockSaveCuts).not.toHaveBeenCalled();
  });
});

describe('trimming a cut', () => {
  it('commits a shortened cut and shortens the movie with it', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    // s2 is five seconds long.
    await act(async () => result.current.trimCut(1, 1, 3.5));

    expect(mockSaveCuts).toHaveBeenCalledWith('m1', [
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1, trim: { startSec: 1, endSec: 3.5 } },
      { snapId: 's3', order: 2 },
    ]);
    expect(result.current.cuts[1].usedSec).toBe(2.5);
    // 3 + 2.5 + 4, where s2 was contributing five.
    expect(result.current.totalSec).toBe(9.5);
  });

  it('holds a window inside the snap and above the minimum cut length', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.trimCut(0, -4, 99));

    // s1 is three seconds; the window widens to the whole snap, so no trim —
    // and an unchanged cut writes nothing.
    expect(result.current.cuts[0].ref.trim).toBeUndefined();
    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('puts a cut back to playing whole', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.trimCut(1, 1, 3));
    await act(async () => result.current.resetTrim(1));

    expect(result.current.cuts[1].ref.trim).toBeUndefined();
    expect(result.current.cuts[1].usedSec).toBe(5);
  });

  it('writes nothing for a drag that settled where it started', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.trimCut(1, 0, 5));

    expect(mockSaveCuts).not.toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it('ignores a trim on a cut whose original was deleted', async () => {
    mockSnaps.mockReturnValue([makeSnap('s1'), makeSnap('s3')]);
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.trimCut(1, 1, 2));

    expect(result.current.cuts[1].ref.trim).toBeUndefined();
    expect(mockSaveCuts).not.toHaveBeenCalled();
  });

  it('undoes a trim back to the whole snap', async () => {
    const { result } = await renderHook(() => useMovieCuts('m1'));

    await act(async () => result.current.trimCut(1, 1, 3.5));
    await act(async () => result.current.undo());

    expect(result.current.cuts[1].ref.trim).toBeUndefined();
    expect(result.current.totalSec).toBe(12);
  });
});
