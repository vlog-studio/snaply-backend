import { describeSession } from './describe-match';
import { groupIntoSessions, type MatchableSnap } from './match-template';

const Noon = new Date('2026-08-03T12:00:00+09:00').getTime();
const MinuteMs = 60 * 1000;
// Same day as the snaps, so the day label is stable regardless of the real clock.
const Now = Noon + 3 * 60 * MinuteMs;

const seongsu = { latitude: 37.5445, longitude: 127.0557 };
// About 1.6 km away — same trip, but not the same block.
const across = { latitude: 37.5589, longitude: 127.0557 };

function snap(id: string, minutesFromNoon: number, place?: MatchableSnap['place']): MatchableSnap {
  return {
    id,
    capturedAt: Noon + minutesFromNoon * MinuteMs,
    durationSec: 3,
    ...(place ? { place } : {}),
  };
}

function sessionOf(snaps: MatchableSnap[]) {
  return groupIntoSessions(snaps)[0];
}

describe('describeSession', () => {
  it('claims the place only when every located snap is in one area', () => {
    const snaps = [snap('a', 0, seongsu), snap('b', 60, seongsu), snap('c', 120, seongsu)];

    expect(describeSession(sessionOf(snaps), snaps, Now)).toBe(
      '오늘 같은 동네에서 2시간 안에 찍은 스냅 3개를 묶었어요.',
    );
  });

  it('drops the place clause when nothing was located', () => {
    const snaps = [snap('a', 0), snap('b', 60), snap('c', 120)];

    expect(describeSession(sessionOf(snaps), snaps, Now)).toBe(
      '오늘 2시간 안에 찍은 스냅 3개를 묶었어요.',
    );
  });

  it('drops the place clause when the outing spread beyond one area', () => {
    const snaps = [snap('a', 0, seongsu), snap('b', 30, across)];

    expect(describeSession(sessionOf(snaps), snaps, Now)).toContain('30분 안에');
    expect(describeSession(sessionOf(snaps), snaps, Now)).not.toContain('같은 동네');
  });

  it.each([
    ['minutes', [snap('a', 0), snap('b', 12)], '12분 안에'],
    ['hours', [snap('a', 0), snap('b', 90)], '2시간 안에'],
    ['a burst', [snap('a', 0), snap('b', 0.2)], '잇따라'],
  ])('says the span in %s', (_case, snaps, expected) => {
    expect(describeSession(sessionOf(snaps), snaps, Now)).toContain(expected);
  });

  it('counts the snaps that are actually used, not the whole outing', () => {
    const snaps = [snap('a', 0), snap('b', 10), snap('c', 20), snap('d', 30)];

    expect(describeSession(sessionOf(snaps), [snaps[0], snaps[2]], Now)).toContain('스냅 2개');
  });

  it('says so plainly when nothing survived the user’s edits', () => {
    const snaps = [snap('a', 0), snap('b', 10)];

    expect(describeSession(sessionOf(snaps), [], Now)).toBe('아직 묶을 만한 스냅을 못 찾았어요.');
  });
});
