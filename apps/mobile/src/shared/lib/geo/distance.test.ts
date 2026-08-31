import { distanceMeters } from './distance';

// Seoul landmarks, so a wrong formula shows up as an obviously wrong number.
const seongsu = { latitude: 37.5445, longitude: 127.0557 };
const yeonnam = { latitude: 37.5601, longitude: 126.9255 };

describe('distanceMeters', () => {
  it('is zero between a point and itself', () => {
    expect(distanceMeters(seongsu, seongsu)).toBe(0);
  });

  it('measures a known city-scale distance', () => {
    // Roughly 11.5 km apart across Seoul.
    expect(distanceMeters(seongsu, yeonnam)).toBeCloseTo(11_600, -2);
  });

  it('is symmetric', () => {
    expect(distanceMeters(seongsu, yeonnam)).toBeCloseTo(distanceMeters(yeonnam, seongsu), 6);
  });

  it('measures a walk down one street in metres, not kilometres', () => {
    const oneBlockNorth = { latitude: seongsu.latitude + 0.0018, longitude: seongsu.longitude };

    expect(distanceMeters(seongsu, oneBlockNorth)).toBeCloseTo(200, -1);
  });
});
