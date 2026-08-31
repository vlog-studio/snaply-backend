import { act, renderHook } from '@testing-library/react-native';

import type { MovieTemplate } from '@/entities/movie-template';
import type { Snap } from '@/entities/snap';

import { useTemplateFill } from './use-template-fill';

import type { TemplateRecommendation } from './use-template-recommendation';

const mockSnaps = jest.fn<Snap[], []>();

jest.mock('@/entities/snap', () => ({
  useSnaps: () => mockSnaps(),
}));

// The server's half is stubbed: what this file is about is how an arriving
// proposal is merged with what the user has already done to the screen. The
// request/poll plumbing is covered in `use-template-recommendation.test.ts`.
const mockRecommendation = jest.fn<TemplateRecommendation | undefined, []>();

jest.mock('./use-template-recommendation', () => ({
  useTemplateRecommendation: () => mockRecommendation(),
}));

const Noon = new Date('2026-08-03T12:00:00+09:00').getTime();
const MinuteMs = 60 * 1000;
const seongsu = { latitude: 37.5445, longitude: 127.0557 };

function makeSnap(id: string, minutesFromNoon: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: Noon + minutesFromNoon * MinuteMs,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
    place: seongsu,
  };
}

const template: MovieTemplate = {
  id: 'walk',
  name: '동네 산책',
  description: '세 장면',
  style: 'emotional',
  bgm: 'lofi-walk',
  slots: [
    { id: 'start', label: '출발', hint: '집 앞' },
    { id: 'alley', label: '골목', hint: '좁은 길' },
    { id: 'back', label: '돌아오는 길', hint: '마무리' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSnaps.mockReturnValue([makeSnap('a', 0), makeSnap('b', 10)]);
  mockRecommendation.mockReturnValue(undefined);
});

describe('useTemplateFill', () => {
  it('lays the outing into the slots in order and leaves the rest empty', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['a', 'b', undefined]);
    expect(result.current.filledCount).toBe(2);
    expect(result.current.totalSec).toBe(6);
    expect(result.current.snapIds).toEqual(['a', 'b']);
  });

  it('puts a confidence on a proposed cut and none on an empty slot', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.slots[0].confidence).toBeGreaterThan(0);
    expect(result.current.slots[2].confidence).toBeUndefined();
  });

  it('drops a cut out of a slot and puts it back', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.dropSlot('start'));
    expect(result.current.slots[0].snap).toBeUndefined();
    expect(result.current.slots[0].isDropped).toBe(true);
    expect(result.current.snapIds).toEqual(['b']);

    await act(async () => result.current.restoreSlot('start'));
    expect(result.current.slots[0].snap?.id).toBe('a');
  });

  it('puts a snap shot for a slot into that slot, with no confidence to claim', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.fillSlot('back', makeSnap('c', 20)));

    expect(result.current.slots[2].snap?.id).toBe('c');
    expect(result.current.slots[2].confidence).toBeUndefined();
    expect(result.current.snapIds).toEqual(['a', 'b', 'c']);
  });

  it('never lets one snap fill two slots after it joins the library', async () => {
    const { result, rerender } = await renderHook(() => useTemplateFill(template));

    // Shooting for the empty slot, then the library gaining that same snap — the
    // next match would otherwise propose it for a slot of its own as well.
    const shot = makeSnap('c', 20);
    await act(async () => result.current.fillSlot('back', shot));
    mockSnaps.mockReturnValue([makeSnap('a', 0), makeSnap('b', 10), shot]);
    await act(async () => rerender({}));

    expect(result.current.snapIds).toEqual(['a', 'b', 'c']);
    expect(new Set(result.current.snapIds).size).toBe(3);
  });

  it('reports and reverses the user’s edits', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));
    expect(result.current.isEdited).toBe(false);

    await act(async () => result.current.dropSlot('start'));
    expect(result.current.isEdited).toBe(true);

    await act(async () => result.current.resetSlots());
    expect(result.current.isEdited).toBe(false);
    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['a', 'b', undefined]);
  });

  it('swaps two snaps without moving the slots they sit in', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.moveSnap(0, 1));

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['b', 'a', undefined]);
    // The template's own scene order is not the user's to change.
    expect(result.current.slots.map((slot) => slot.slot.label)).toEqual([
      '출발',
      '골목',
      '돌아오는 길',
    ]);
    expect(result.current.snapIds).toEqual(['b', 'a']);
  });

  it('keeps each snap’s confidence with it across a swap', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));
    const before = result.current.slots.map((slot) => slot.confidence);

    await act(async () => result.current.moveSnap(0, 1));

    expect(result.current.slots[0].confidence).toBe(before[1]);
    expect(result.current.slots[1].confidence).toBe(before[0]);
  });

  it('counts a reorder as an edit and undoes it with the rest', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.moveSnap(0, 1));
    expect(result.current.isEdited).toBe(true);

    await act(async () => result.current.resetSlots());
    expect(result.current.isEdited).toBe(false);
    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['a', 'b', undefined]);
  });

  it('refuses to move a row off either end of the list', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.slots[0].canMoveUp).toBe(false);
    expect(result.current.slots[2].canMoveDown).toBe(false);

    await act(async () => result.current.moveSnap(0, -1));
    await act(async () => result.current.moveSnap(2, 1));

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['a', 'b', undefined]);
    expect(result.current.isEdited).toBe(false);
  });

  it('pins a dropped row, and the arrows either side of it, rather than swapping nothing', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.dropSlot('alley'));

    expect(result.current.slots[1].canMoveUp).toBe(false);
    expect(result.current.slots[1].canMoveDown).toBe(false);
    expect(result.current.slots[0].canMoveDown).toBe(false);
    expect(result.current.slots[2].canMoveUp).toBe(false);
  });

  it('pins a row the user shot for, since its snap belongs to that slot', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.fillSlot('back', makeSnap('c', 20)));

    expect(result.current.slots[2].canMoveUp).toBe(false);
    expect(result.current.slots[1].canMoveDown).toBe(false);
    // The row above the pinned one can still trade with the row above *it*.
    expect(result.current.slots[1].canMoveUp).toBe(true);
  });

  it('leaves every slot empty and says so when the library has no outing', async () => {
    mockSnaps.mockReturnValue([]);
    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.hasMatch).toBe(false);
    expect(result.current.filledCount).toBe(0);
    expect(result.current.slots).toHaveLength(3);
    expect(result.current.summary).toContain('빈 자리를 찍어서');
  });

  it('answers empty for no template at all', async () => {
    const { result } = await renderHook(() => useTemplateFill(undefined));

    expect(result.current.slots).toEqual([]);
    expect(result.current.snapIds).toEqual([]);
  });

  it('says the number is an outing confidence while only the local match has run', async () => {
    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.confidenceKind).toBe('outing');
  });
});

// The second stage: the local match has already drawn the screen, and this is
// what happens when the server's proposal turns up afterwards.
describe('useTemplateFill with a recommendation', () => {
  beforeEach(() => {
    mockSnaps.mockReturnValue([makeSnap('a', 0), makeSnap('b', 10), makeSnap('c', 20)]);
  });

  it('lays the server proposal into the slots it names', async () => {
    // Deliberately not the order the outing happened in.
    mockRecommendation.mockReturnValue({
      start: { snapId: 'c', score: 0.9 },
      alley: { snapId: 'a', score: 0.6 },
    });

    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['c', 'a', undefined]);
    expect(result.current.confidenceKind).toBe('slot-fit');
    expect(result.current.slots[0].confidence).toBe(0.9);
  });

  it('leaves a slot the server filled nothing for empty', async () => {
    mockRecommendation.mockReturnValue({ start: { snapId: 'a', score: 0.8 } });

    const { result } = await renderHook(() => useTemplateFill(template));

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['a', undefined, undefined]);
  });

  it('does not disturb a slot the user shot for', async () => {
    const { result, rerender } = await renderHook(() => useTemplateFill(template));

    const shot = makeSnap('d', 30);
    await act(async () => result.current.fillSlot('start', shot));
    // The answer arrives after the user has already filled that row by hand.
    mockRecommendation.mockReturnValue({ start: { snapId: 'a', score: 0.9 } });
    await act(async () => rerender({}));

    expect(result.current.slots[0].snap?.id).toBe('d');
    expect(result.current.slots[0].confidence).toBeUndefined();
  });

  it('does not put a snap back into a slot the user dropped', async () => {
    const { result, rerender } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.dropSlot('start'));
    mockRecommendation.mockReturnValue({ start: { snapId: 'a', score: 0.9 } });
    await act(async () => rerender({}));

    expect(result.current.slots[0].snap).toBeUndefined();
    expect(result.current.slots[0].isDropped).toBe(true);
  });

  it('keeps the arrangement the user was working on when an answer lands mid-reorder', async () => {
    const { result, rerender } = await renderHook(() => useTemplateFill(template));
    // Local order is a, b, c; the user trades the first two.
    await act(async () => result.current.moveSnap(0, 1));
    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['b', 'a', 'c']);

    mockRecommendation.mockReturnValue({
      start: { snapId: 'c', score: 0.9 },
      alley: { snapId: 'a', score: 0.6 },
      back: { snapId: 'b', score: 0.5 },
    });
    await act(async () => rerender({}));

    // Their swap still means what it meant when they made it.
    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['b', 'a', 'c']);
    expect(result.current.confidenceKind).toBe('outing');
  });

  it('takes the better proposal once the user undoes their edits', async () => {
    const { result, rerender } = await renderHook(() => useTemplateFill(template));
    await act(async () => result.current.moveSnap(0, 1));
    mockRecommendation.mockReturnValue({
      start: { snapId: 'c', score: 0.9 },
      alley: { snapId: 'a', score: 0.6 },
      back: { snapId: 'b', score: 0.5 },
    });
    await act(async () => rerender({}));

    await act(async () => result.current.resetSlots());

    expect(result.current.slots.map((slot) => slot.snap?.id)).toEqual(['c', 'a', 'b']);
    expect(result.current.confidenceKind).toBe('slot-fit');
  });

  it('drops the number from a row moved out of the position it was scored for', async () => {
    mockRecommendation.mockReturnValue({
      start: { snapId: 'a', score: 0.9 },
      alley: { snapId: 'b', score: 0.6 },
      back: { snapId: 'c', score: 0.5 },
    });
    const { result } = await renderHook(() => useTemplateFill(template));

    await act(async () => result.current.moveSnap(0, 1));

    // `b` now sits in 출발, and 0.6 was how well it suited 골목 — not this row.
    expect(result.current.slots[0].snap?.id).toBe('b');
    expect(result.current.slots[0].confidence).toBeUndefined();
    expect(result.current.slots[2].confidence).toBe(0.5);
  });
});
