import type { MovieJob } from '../model/movie';

/**
 * How far a job has come, as a fraction — what every surface that draws a job
 * fills its ring or bar to.
 *
 * The number comes from the backend (`MovieJob.progress`, published at the
 * pipeline's own milestones) rather than from a clock. That is the whole of the
 * 2026-08-07 change: generation used to be simulated locally, so progress was
 * *derived* from a start time against a table of step durations that stood for
 * nothing, and every surface needed a ticker to watch it. Now one store write per
 * milestone updates every surface at once, and none of them ticks.
 *
 * A job stored by a build that predates the change has a step index and no
 * percentage; it reads as 0 rather than as a fraction of a step table that no
 * longer exists. Its run cannot be followed anyway — the id it holds is local and
 * the backend knows nothing about it — so the runner fails it on the next look
 * (see `features/compose-movie`).
 */
export function movieJobRatio(job: MovieJob): number {
  const progress = job.progress ?? 0;
  return Math.min(1, Math.max(0, progress / 100));
}
