import { act, renderHook } from '@testing-library/react-native';

import type { Snap } from './snap';
import {
  useAddSnap,
  useRecordSnapMeasurement,
  useRemoveSnaps,
  useSnaps,
  useSnapStore,
} from './snap-store';

// Mock the persistence backend so no native file system is touched.
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

function makeSnap(overrides: Partial<Snap> = {}): Snap {
  return {
    id: 'snap-1',
    uri: 'file:///doc/recordings/snaply-1.mp4',
    durationSec: 3,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    ...overrides,
  };
}

describe('snap store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The store is a module-level singleton; reset it so tests stay independent.
    useSnapStore.setState({ snaps: [] });
  });

  it('starts empty', async () => {
    const { result } = await renderHook(() => useSnaps());
    expect(result.current).toEqual([]);
  });

  it('prepends an added snap so the newest is first', async () => {
    const { result } = await renderHook(() => ({ snaps: useSnaps(), addSnap: useAddSnap() }));

    await act(async () => result.current.addSnap(makeSnap({ id: 'snap-1' })));
    await act(async () => result.current.addSnap(makeSnap({ id: 'snap-2' })));

    expect(result.current.snaps.map((snap) => snap.id)).toEqual(['snap-2', 'snap-1']);
  });

  it('ignores a duplicate id', async () => {
    const { result } = await renderHook(() => ({ snaps: useSnaps(), addSnap: useAddSnap() }));

    await act(async () => result.current.addSnap(makeSnap({ id: 'snap-1' })));
    await act(async () => result.current.addSnap(makeSnap({ id: 'snap-1', durationSec: 5 })));

    expect(result.current.snaps).toHaveLength(1);
    expect(result.current.snaps[0].durationSec).toBe(3);
  });

  it('removes several snaps in one write', async () => {
    // Seeded before anything renders, so there is no update for `act` to flush;
    // wrapping it would open an act scope the later assertions render inside.
    useSnapStore.setState({
      snaps: [makeSnap({ id: 'snap-1' }), makeSnap({ id: 'snap-2' }), makeSnap({ id: 'snap-3' })],
    });

    const { result } = await renderHook(() => ({
      snaps: useSnaps(),
      removeSnaps: useRemoveSnaps(),
    }));

    await act(async () => result.current.removeSnaps(['snap-1', 'snap-3']));

    expect(result.current.snaps.map((snap) => snap.id)).toEqual(['snap-2']);
  });

  it.each([[[]], [['snap-unknown']]])('leaves the snaps untouched for %j', async (ids) => {
    useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1' })] });

    const { result } = await renderHook(() => useRemoveSnaps());
    await act(async () => result.current(ids));

    expect(useSnapStore.getState().snaps.map((snap) => snap.id)).toEqual(['snap-1']);
  });

  describe('recordMeasurement', () => {
    it('writes the measured length over the one assumed at capture time', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1', durationSec: 3 })] });

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () => result.current('snap-1', { durationSec: 1.2 }));

      expect(useSnapStore.getState().snaps[0]).toMatchObject({
        durationSec: 1.2,
        durationMeasured: true,
      });
    });

    // A captured snap used to claim the upright 1080×1920 stand-in; the camera
    // records 720p, and a phone held sideways records landscape.
    it('writes the measured size and its orientation over the stand-in', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1' })] });

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () => result.current('snap-1', { width: 1280, height: 720 }));

      expect(useSnapStore.getState().snaps[0]).toMatchObject({
        width: 1280,
        height: 720,
        orientation: 'landscape',
        dimensionsMeasured: true,
      });
    });

    it('records both in one write when the file answered both', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1', durationSec: 3 })] });

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () =>
        result.current('snap-1', { durationSec: 1.2, width: 720, height: 1280 }),
      );

      expect(useSnapStore.getState().snaps[0]).toMatchObject({
        durationSec: 1.2,
        durationMeasured: true,
        width: 720,
        height: 1280,
        orientation: 'portrait',
        dimensionsMeasured: true,
      });
    });

    // A size needs both numbers; a lone width says nothing about the frame.
    it('leaves the size alone when only half of it was read', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1' })] });

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () => result.current('snap-1', { durationSec: 2, width: 720 }));

      expect(useSnapStore.getState().snaps[0]).toMatchObject({ width: 1080, height: 1920 });
      expect(useSnapStore.getState().snaps[0]).not.toHaveProperty('dimensionsMeasured');
    });

    // The backfill walks the whole library on every start; re-measuring to the
    // same answer must not persist the file or re-render the screens holding it.
    it('keeps the same list when the measurement confirms what is stored', async () => {
      useSnapStore.setState({
        snaps: [
          makeSnap({
            id: 'snap-1',
            durationSec: 1.2,
            durationMeasured: true,
            width: 720,
            height: 1280,
            dimensionsMeasured: true,
          }),
        ],
      });
      const before = useSnapStore.getState().snaps;

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () =>
        result.current('snap-1', { durationSec: 1.2, width: 720, height: 1280 }),
      );

      expect(useSnapStore.getState().snaps).toBe(before);
    });

    it('keeps the same list when the measurement holds nothing', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1' })] });
      const before = useSnapStore.getState().snaps;

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () => result.current('snap-1', {}));

      expect(useSnapStore.getState().snaps).toBe(before);
    });

    it('marks a snap measured even when the file agrees with what was assumed', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1', durationSec: 3 })] });

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () =>
        result.current('snap-1', { durationSec: 3, width: 1080, height: 1920 }),
      );

      expect(useSnapStore.getState().snaps[0]).toMatchObject({
        durationMeasured: true,
        dimensionsMeasured: true,
      });
    });

    it('ignores a snap that is no longer in the library', async () => {
      useSnapStore.setState({ snaps: [makeSnap({ id: 'snap-1' })] });
      const before = useSnapStore.getState().snaps;

      const { result } = await renderHook(() => useRecordSnapMeasurement());
      await act(async () => result.current('snap-gone', { durationSec: 2 }));

      expect(useSnapStore.getState().snaps).toBe(before);
    });
  });
});
