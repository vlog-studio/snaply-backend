import { act, renderHook } from '@testing-library/react-native';

import { useSnapPicking, type SnapPickTarget } from './use-snap-picking';

/** Stands in for a screen's own wording — the hook only decides when to say it. */
const refusal = (room: number) => `no room: ${room}`;

function makeTarget(overrides: Partial<SnapPickTarget> = {}): SnapPickTarget {
  return {
    heldIds: new Set<string>(),
    heldCount: 0,
    capacity: 3,
    describeRefusal: refusal,
    ...overrides,
  };
}

async function renderPicking(target: SnapPickTarget = makeTarget()) {
  return renderHook(() => useSnapPicking(target));
}

describe('useSnapPicking', () => {
  it('keeps the picks in pick order', async () => {
    const { result } = await renderPicking();

    await act(async () => result.current.toggle('c'));
    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));

    expect(result.current.picked).toEqual(['c', 'a', 'b']);
  });

  it('takes a pick back on a second toggle', async () => {
    const { result } = await renderPicking();

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    await act(async () => result.current.toggle('a'));

    expect(result.current.picked).toEqual(['b']);
  });

  it('reports the room left over from what the target already holds', async () => {
    const { result } = await renderPicking(
      makeTarget({ heldIds: new Set(['held']), heldCount: 1, capacity: 3 }),
    );

    expect(result.current.room).toBe(2);
  });

  it('refuses a pick past the room left and says why', async () => {
    const { result } = await renderPicking(makeTarget({ capacity: 2 }));

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    await act(async () => result.current.toggle('c'));

    expect(result.current.picked).toEqual(['a', 'b']);
    expect(result.current.notice).toBe(refusal(2));
  });

  it('lets a snap the target already holds through, since it takes no new room', async () => {
    const { result } = await renderPicking(
      makeTarget({ heldIds: new Set(['held']), heldCount: 1, capacity: 2 }),
    );

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('held'));

    expect(result.current.picked).toEqual(['a', 'held']);
    expect(result.current.notice).toBeUndefined();
  });

  it('refuses every pick when the target is already full', async () => {
    const { result } = await renderPicking(
      makeTarget({ heldIds: new Set(['held']), heldCount: 3, capacity: 3 }),
    );

    await act(async () => result.current.toggle('a'));

    expect(result.current.picked).toEqual([]);
    expect(result.current.notice).toBe(refusal(0));
  });

  it('clears the refusal as soon as a pick lands', async () => {
    const { result } = await renderPicking(makeTarget({ capacity: 1 }));

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    expect(result.current.notice).toBe(refusal(1));

    await act(async () => result.current.toggle('a'));

    expect(result.current.notice).toBeUndefined();
  });

  it('drops only the named picks and keeps the notice', async () => {
    const { result } = await renderPicking(makeTarget({ capacity: 2 }));

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    await act(async () => result.current.toggle('c'));
    await act(async () => result.current.drop(['a']));

    expect(result.current.picked).toEqual(['b']);
    expect(result.current.notice).toBe(refusal(2));
  });

  it('clears the picks but stays in picking mode, keeping the notice', async () => {
    const { result } = await renderPicking(makeTarget({ capacity: 1 }));

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    await act(async () => result.current.clear());

    expect(result.current.picked).toEqual([]);
    expect(result.current.notice).toBe(refusal(1));
  });

  it('resets the picks and the notice together', async () => {
    const { result } = await renderPicking(makeTarget({ capacity: 1 }));

    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.toggle('b'));
    await act(async () => result.current.reset());

    expect(result.current.picked).toEqual([]);
    expect(result.current.notice).toBeUndefined();
  });

  it('announces what only the screen could know', async () => {
    const { result } = await renderPicking();
    const message = '2개를 담았어요.'; // 2개를 담았어요.

    await act(async () => result.current.announce(message));

    expect(result.current.notice).toBe(message);
  });
});
