import type { Movie } from '../model/movie';
import type { RemoteMovie } from '../model/remote-movie';
import { mergeRemoteMovies, movieFromRemote } from './movie-sync';

const at = 1_753_200_000_000;

function remote(overrides: Partial<RemoteMovie> = {}): RemoteMovie {
  return {
    id: 'm1',
    title: '무비', // 무비
    status: 'draft',
    style: 'daily',
    captions: false,
    ratio: '9:16',
    arranger: 'user',
    snapRefs: [{ snapId: 's1', order: 0, videoId: 'v1' }],
    createdAt: at,
    updatedAt: at + 1_000,
    ...overrides,
  };
}

function local(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'm1',
    title: '무비',
    status: 'draft',
    createdAt: at,
    updatedAt: at,
    snapRefs: [{ snapId: 's1', order: 0 }],
    style: 'daily',
    bgm: 'lofi-walk',
    captions: false,
    ratio: '9:16',
    ...overrides,
  };
}

const noOutbox = { pending: {}, deletes: [] };

describe('movieFromRemote', () => {
  it('takes the composition and settings from the server', () => {
    const movie = movieFromRemote(
      remote({ title: '제주', style: 'travel', captions: true, arranger: 'ai' }),
      undefined,
    );

    expect(movie).toMatchObject({
      title: '제주',
      style: 'travel',
      captions: true,
      arranger: 'ai',
      status: 'draft',
      snapRefs: [{ snapId: 's1', order: 0, videoId: 'v1' }],
    });
    expect(movie.bgm).toBeDefined();
  });

  // The pipeline scores from the preset, so the server has no track; the
  // device's stored pick is not something a read-back may erase.
  it('keeps the local track choice, which the server does not hold', () => {
    expect(movieFromRemote(remote(), local({ bgm: 'sunny-day' })).bgm).toBe('sunny-day');
  });

  it('hands a run this device did not start to the runner as an adopted job', () => {
    const movie = movieFromRemote(remote({ status: 'generating', jobId: 'job-9' }), undefined);

    expect(movie.status).toBe('generating');
    expect(movie.job).toEqual({ id: 'job-9', progress: 0, startedAt: at + 1_000, adopted: true });
  });

  it('keeps the progress of a run this device is already following', () => {
    const job = { id: 'job-9', progress: 60, step: 'x', startedAt: at };
    const movie = movieFromRemote(
      remote({ status: 'generating', jobId: 'job-9' }),
      local({ status: 'generating', job }),
    );

    expect(movie.job).toBe(job);
  });

  it('keeps the render this device holds for the very result the server names', () => {
    const render = {
      videoId: 'r1',
      uri: 'https://x/r1.mp4',
      thumbnailUri: 'file:///c.jpg',
      renderedAt: at,
      durationSec: 9,
    };
    const movie = movieFromRemote(
      remote({ status: 'ready', resultVideoId: 'r1', jobId: 'job-1' }),
      local({ status: 'ready', render }),
    );

    expect(movie.status).toBe('ready');
    expect(movie.render).toBe(render);
  });

  // A movie remade elsewhere names a different result: the old file must not
  // keep playing, and the new one is learned by following its run.
  it('follows the run behind a result this device has not seen', () => {
    const movie = movieFromRemote(
      remote({ status: 'ready', resultVideoId: 'r2', jobId: 'job-2' }),
      local({ status: 'ready', render: { videoId: 'r1', renderedAt: at, durationSec: 9 } }),
    );

    expect(movie.status).toBe('generating');
    expect(movie.job).toMatchObject({ id: 'job-2', adopted: true });
    expect(movie.render).toBeUndefined();
  });

  // The device settled job-1 (a cancel, a completion) and the server's read
  // raced its own catch-up; flickering back through `generating` on every
  // read is the bug, and losing the render this device has is the worse one.
  it.each([
    ['a canceled run', local({ status: 'draft', settledJobId: 'job-1' }), 'draft'],
    [
      'a completed run',
      local({
        status: 'ready',
        settledJobId: 'job-1',
        render: { videoId: 'r1', renderedAt: at, durationSec: 4 },
      }),
      'ready',
    ],
  ])('keeps the outcome it already applied to %s', (_case, mine, status) => {
    const movie = movieFromRemote(remote({ status: 'generating', jobId: 'job-1' }), mine);

    expect(movie.status).toBe(status);
    expect(movie.render).toBe(mine.render);
    expect(movie.settledJobId).toBe('job-1');
  });

  it('keeps the words a failure was given here', () => {
    const movie = movieFromRemote(
      remote({ status: 'failed', jobId: 'job-1' }),
      local({ status: 'failed', error: '실패', errorDetail: 'TIMEOUT' }),
    );

    expect(movie).toMatchObject({ status: 'failed', error: '실패', errorDetail: 'TIMEOUT' });
  });

  it('learns an unwitnessed failure by following its run', () => {
    const movie = movieFromRemote(remote({ status: 'failed', jobId: 'job-1' }), undefined);

    expect(movie.status).toBe('generating');
    expect(movie.job).toMatchObject({ id: 'job-1', adopted: true });
  });

  it('records when the user finished the movie', () => {
    expect(movieFromRemote(remote({ finishedAt: at + 5 }), undefined).finishedAt).toBe(at + 5);
  });
});

describe('mergeRemoteMovies', () => {
  it('takes the server’s version of a movie with nothing pending here', () => {
    const merged = mergeRemoteMovies(
      [local({ title: 'old' })],
      [remote({ title: 'new' })],
      noOutbox,
    );

    expect(merged.map((movie) => movie.title)).toEqual(['new']);
  });

  it('keeps the local version of a movie the server has not been told about yet', () => {
    const mine = local({ title: 'edited here' });
    const merged = mergeRemoteMovies([mine], [remote({ title: 'stale' })], {
      pending: { m1: 'update' },
      deletes: [],
    });

    expect(merged[0]).toBe(mine);
  });

  it('adds a movie only the server has', () => {
    const merged = mergeRemoteMovies([], [remote({ id: 'm2' })], noOutbox);
    expect(merged.map((movie) => movie.id)).toEqual(['m2']);
  });

  it('drops a movie the server no longer has, unless it is still waiting to be created', () => {
    const merged = mergeRemoteMovies([local({ id: 'gone' }), local({ id: 'new' })], [], {
      pending: { new: 'create' },
      deletes: [],
    });

    expect(merged.map((movie) => movie.id)).toEqual(['new']);
  });

  it('leaves out a movie deleted here that the server still holds', () => {
    const merged = mergeRemoteMovies([], [remote({ id: 'm1' })], { pending: {}, deletes: ['m1'] });
    expect(merged).toEqual([]);
  });
});
