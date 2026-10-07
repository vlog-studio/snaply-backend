import { daysLeftLabel } from './days-left';

const now = 1_760_000_000_000;
const day = 24 * 60 * 60 * 1000;

describe('daysLeftLabel', () => {
  it.each([
    [now + 14 * day, '14일 남음'], // 14일 남음
    [now + day + 1, '2일 남음'], // 2일 남음 — a part day counts
    [now + day, '오늘까지'], // 오늘까지
    [now + 60_000, '오늘까지'],
  ])('%d → %s', (until, expected) => {
    expect(daysLeftLabel(until, now)).toBe(expected);
  });
});
