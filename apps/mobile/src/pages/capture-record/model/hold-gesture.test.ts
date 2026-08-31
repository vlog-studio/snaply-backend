import { MIN_COLLECT_HOLD_MS, shouldCollectHold } from './hold-gesture';

describe('shouldCollectHold', () => {
  it.each([0, 100, MIN_COLLECT_HOLD_MS])('discards an accidental tap of %dms', (heldMs) => {
    expect(shouldCollectHold(heldMs)).toBe(false);
  });

  it.each([MIN_COLLECT_HOLD_MS + 1, 1000, 5000])('collects a real hold of %dms', (heldMs) => {
    expect(shouldCollectHold(heldMs)).toBe(true);
  });
});
