import {
  SessionGapMs,
  groupIntoSessions,
  pickBestSession,
  sessionConfidence,
  spreadAcrossSlots,
  type MatchableSnap,
} from './match-template';

const Noon = new Date('2026-08-03T12:00:00+09:00').getTime();
const MinuteMs = 60 * 1000;

const seongsu = { latitude: 37.5445, longitude: 127.0557 };
const yeonnam = { latitude: 37.5601, longitude: 126.9255 };

function snap(id: string, minutesFromNoon: number, place?: MatchableSnap['place']): MatchableSnap {
  return {
    id,
    capturedAt: Noon + minutesFromNoon * MinuteMs,
    durationSec: 3,
    ...(place ? { place } : {}),
  };
}

describe('groupIntoSessions', () => {
  it('keeps snaps taken minutes apart in one outing', () => {
    const sessions = groupIntoSessions([snap('a', 0), snap('b', 10), snap('c', 25)]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].snaps.map((each) => each.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders a shuffled library before grouping it', () => {
    const sessions = groupIntoSessions([snap('c', 25), snap('a', 0), snap('b', 10)]);

    expect(sessions[0].snaps.map((each) => each.id)).toEqual(['a', 'b', 'c']);
  });

  it('splits on a long gap', () => {
    const sessions = groupIntoSessions([snap('a', 0), snap('b', SessionGapMs / MinuteMs + 1)]);

    expect(sessions).toHaveLength(2);
  });

  it('splits when the next snap is a different part of the city', () => {
    const sessions = groupIntoSessions([snap('a', 0, seongsu), snap('b', 30, yeonnam)]);

    expect(sessions).toHaveLength(2);
  });

  it('groups on time alone when no snap carries a place', () => {
    const sessions = groupIntoSessions([snap('a', 0), snap('b', 30), snap('c', 60)]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].hasPlaces).toBe(false);
  });

  it('keeps a snap with no place inside the outing around it', () => {
    const sessions = groupIntoSessions([
      snap('a', 0, seongsu),
      snap('b', 10),
      snap('c', 20, seongsu),
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].hasPlaces).toBe(true);
  });
});

describe('pickBestSession', () => {
  it('prefers the outing that fills more slots', () => {
    const sessions = groupIntoSessions([
      snap('a', 0),
      snap('b', 5),
      snap('c', 10),
      snap('x', 600),
      snap('y', 605),
    ]);

    expect(pickBestSession(sessions, 6)?.snaps).toHaveLength(3);
  });

  it('prefers the more recent outing when both fill the template', () => {
    const sessions = groupIntoSessions([
      snap('a', 0),
      snap('b', 5),
      snap('c', 10),
      snap('x', 600),
      snap('y', 605),
      snap('z', 610),
    ]);

    expect(pickBestSession(sessions, 2)?.snaps.map((each) => each.id)).toEqual(['x', 'y', 'z']);
  });

  it('offers nothing when a single snap is all there is', () => {
    expect(pickBestSession(groupIntoSessions([snap('a', 0)]), 4)).toBeUndefined();
  });

  it('offers nothing from an empty library', () => {
    expect(pickBestSession(groupIntoSessions([]), 4)).toBeUndefined();
  });
});

describe('spreadAcrossSlots', () => {
  it('leaves the tail empty when there are fewer snaps than slots', () => {
    const laid = spreadAcrossSlots([snap('a', 0), snap('b', 5)], 4);

    expect(laid.map((each) => each?.id)).toEqual(['a', 'b', undefined, undefined]);
  });

  it('keeps the first and last snap when it has to sample', () => {
    const snaps = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => snap(id, index * 5));

    const laid = spreadAcrossSlots(snaps, 3);

    // The middle of six snaps falls between c and d; either is the point, the
    // ends are what must not move.
    expect(laid.map((each) => each?.id)).toEqual(['a', 'd', 'f']);
  });

  it('never puts one snap in two slots', () => {
    const snaps = ['a', 'b', 'c', 'd', 'e'].map((id, index) => snap(id, index * 5));

    const ids = spreadAcrossSlots(snaps, 4).map((each) => each?.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('answers nothing for a template with no slots', () => {
    expect(spreadAcrossSlots([snap('a', 0)], 0)).toEqual([]);
  });
});

describe('sessionConfidence', () => {
  it('is high for a snap taken minutes from its neighbours, in the same spot', () => {
    const session = groupIntoSessions([
      snap('a', 0, seongsu),
      snap('b', 5, seongsu),
      snap('c', 10, seongsu),
    ])[0];

    expect(sessionConfidence(session.snaps[1], session)).toBeGreaterThan(0.9);
  });

  it('is lower for a snap with no coordinates than for the same snap with them', () => {
    const placed = groupIntoSessions([snap('a', 0, seongsu), snap('b', 5, seongsu)])[0];
    const unplaced = groupIntoSessions([snap('a', 0), snap('b', 5)])[0];

    expect(sessionConfidence(unplaced.snaps[1], unplaced)).toBeLessThan(
      sessionConfidence(placed.snaps[1], placed),
    );
  });

  it('falls off as a snap sits further from the rest of the outing in time', () => {
    const tight = groupIntoSessions([snap('a', 0, seongsu), snap('b', 5, seongsu)])[0];
    const loose = groupIntoSessions([snap('a', 0, seongsu), snap('b', 150, seongsu)])[0];

    expect(sessionConfidence(loose.snaps[1], loose)).toBeLessThan(
      sessionConfidence(tight.snaps[1], tight),
    );
  });

  it('stays between nothing and certainty', () => {
    const session = groupIntoSessions([snap('a', 0, seongsu), snap('b', 5, seongsu)])[0];

    session.snaps.forEach((each) => {
      const confidence = sessionConfidence(each, session);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });
});
