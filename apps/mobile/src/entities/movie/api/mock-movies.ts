import type { MovieBody, MovieDto } from './movie.dto';

/**
 * The movie API, in memory, for a build with no backend origin configured.
 *
 * It keeps the server's rules where the app can observe them — a client-given
 * id is honoured and idempotent, an export puts the movie in `generating` and
 * a later read finds it `ready` (mock runs finish at once, which is also what
 * `getEditJob`'s mock answers), a finish empties the result — so the screens
 * exercise the same transitions they will against the real thing. Nothing here
 * is persisted: a restart starts the mock server empty, exactly as a fresh
 * account would.
 */
const movies = new Map<string, MovieDto>();

function now(): string {
  return new Date().toISOString();
}

function settle(movie: MovieDto): MovieDto {
  if (movie.status !== 'generating') return movie;
  const ready = { ...movie, status: 'ready' };
  movies.set(movie.id, ready);
  return ready;
}

export function mockListMovies(): MovieDto[] {
  return [...movies.values()]
    .map(settle)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mockCreateMovie(id: string, body: MovieBody): MovieDto {
  const existing = movies.get(id);
  if (existing) return existing;
  const stamp = now();
  const created: MovieDto = {
    id,
    ...toFields(body),
    status: 'draft',
    ratio: '9:16',
    resultVideoId: null,
    jobId: null,
    finishedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  movies.set(id, created);
  return created;
}

export function mockUpdateMovie(id: string, body: MovieBody): MovieDto | undefined {
  const current = movies.get(id);
  if (!current) return undefined;
  const updated = { ...current, ...toFields(body), updatedAt: now() };
  movies.set(id, updated);
  return updated;
}

export function mockDeleteMovie(id: string): boolean {
  return movies.delete(id);
}

export function mockExportMovie(id: string): { jobId: string } | undefined {
  const current = movies.get(id);
  if (!current) return undefined;
  const jobId = `mock-job-${Date.now()}`;
  movies.set(id, {
    ...current,
    status: 'generating',
    // The same id `getEditJob`'s mock reports for this job, so the runner's
    // lookup and this row agree about what the run produced.
    resultVideoId: `mock-result-${jobId}`,
    jobId,
    finishedAt: null,
  });
  return { jobId };
}

export function mockFinishMovie(
  id: string,
): { finishedAt: string; resultDeleted: boolean } | undefined {
  const current = movies.get(id);
  if (!current) return undefined;
  const finishedAt = now();
  movies.set(id, {
    ...current,
    status: 'draft',
    resultVideoId: null,
    jobId: null,
    finishedAt,
  });
  return { finishedAt, resultDeleted: current.resultVideoId !== null };
}

function toFields(body: MovieBody) {
  return {
    title: body.title,
    stylePreset: body.stylePreset,
    captions: body.captions,
    arranger: body.arranger,
    clips: body.clips.map((clip) => ({ ...clip, unavailable: false })),
  };
}

/** For tests: forget everything the mock server holds. */
export function resetMockMovies(): void {
  movies.clear();
}
