import { movieJobRatio } from './movie-generation';

const job = (progress?: number) => ({ id: 'job-1', startedAt: 1_000, progress });

describe('movieJobRatio', () => {
  it.each([
    [0, 0],
    [35, 0.35],
    [100, 1],
  ])('reports %s%% as %s', (progress, expected) => {
    expect(movieJobRatio(job(progress))).toBeCloseTo(expected);
  });

  // A job stored before the backend reported progress has none. It reads as the
  // start rather than as a fraction of a step table that no longer exists.
  it('reads a job with no reported progress as at the start', () => {
    expect(movieJobRatio(job(undefined))).toBe(0);
  });

  it.each([
    [-10, 0],
    [140, 1],
  ])('clamps an out-of-range %s to %s', (progress, expected) => {
    expect(movieJobRatio(job(progress))).toBe(expected);
  });
});
