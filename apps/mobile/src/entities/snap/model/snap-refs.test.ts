import { renderHook } from '@testing-library/react-native';

import type { Snap } from './snap';
import { snapsByRefs, useSnapIndex } from './snap-refs';
import { useSnapStore } from './snap-store';

// Mock the persistence backend so no native file system is touched.
jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

function makeSnap(id: string): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

const s1 = makeSnap('s1');
const s2 = makeSnap('s2');
const s3 = makeSnap('s3');

function indexOf(...snaps: Snap[]) {
  return new Map(snaps.map((snap) => [snap.id, snap]));
}

function ids(snaps: Snap[]) {
  return snaps.map((snap) => snap.id);
}

describe('snapsByRefs', () => {
  it('orders the resolved snaps by each reference order, not by reference position', () => {
    const refs = [
      { snapId: 's3', order: 2 },
      { snapId: 's1', order: 0 },
      { snapId: 's2', order: 1 },
    ];

    expect(ids(snapsByRefs(refs, indexOf(s1, s2, s3)))).toEqual(['s1', 's2', 's3']);
  });

  it('skips a reference whose snap is gone from the library', () => {
    const refs = [
      { snapId: 's1', order: 0 },
      { snapId: 'deleted', order: 1 },
      { snapId: 's2', order: 2 },
    ];

    expect(ids(snapsByRefs(refs, indexOf(s1, s2)))).toEqual(['s1', 's2']);
  });

  it('treats order as a sort key only, so gaps resolve the same way', () => {
    const refs = [
      { snapId: 's2', order: 40 },
      { snapId: 's1', order: 7 },
    ];

    expect(ids(snapsByRefs(refs, indexOf(s1, s2)))).toEqual(['s1', 's2']);
  });

  it('leaves the caller-supplied references untouched', () => {
    const refs = [
      { snapId: 's2', order: 1 },
      { snapId: 's1', order: 0 },
    ];

    snapsByRefs(refs, indexOf(s1, s2));

    expect(refs.map((ref) => ref.snapId)).toEqual(['s2', 's1']);
  });

  it.each([
    ['no references', []],
    ['undefined references', undefined],
  ])('resolves %s to the same empty result', (_label, refs) => {
    const first = snapsByRefs(refs, indexOf(s1));
    const second = snapsByRefs(refs, indexOf(s1));

    expect(first).toEqual([]);
    // A stable empty array, so an empty movie does not re-render its consumers.
    expect(first).toBe(second);
  });

  it('resolves to nothing when the library holds none of the referenced snaps', () => {
    expect(snapsByRefs([{ snapId: 's1', order: 0 }], indexOf())).toEqual([]);
  });
});

describe('useSnapIndex', () => {
  beforeEach(() => {
    useSnapStore.setState({ snaps: [] });
  });

  it('indexes the whole library by snap id', async () => {
    useSnapStore.setState({ snaps: [s1, s2] });

    const { result } = await renderHook(() => useSnapIndex());

    expect(result.current.get('s1')).toBe(s1);
    expect(result.current.get('s2')).toBe(s2);
    expect(result.current.size).toBe(2);
  });
});
