import type { Movie } from '../model/movie';
import { mapRemoteMovie, movieDtoSchema, toMovieBody, type MovieDto } from './movie.dto';

const snapIdOf = (videoId: string) => `snap-${videoId}`;

function dto(clips: MovieDto['clips']): MovieDto {
  return movieDtoSchema.parse({
    id: 'm1',
    title: '무비',
    status: 'draft',
    stylePreset: '감성',
    captions: false,
    ratio: '9:16',
    arranger: 'user',
    clips,
    resultVideoId: null,
    jobId: null,
    finishedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
}

describe('reading transitions back', () => {
  it('keeps who chose each boundary and which cut it leads into', () => {
    const remote = mapRemoteMovie(
      dto([
        {
          videoId: 'v1',
          unavailable: false,
          transition: { kind: 'dip', durationMs: 400, owner: 'user' },
        },
        { videoId: 'v2', unavailable: false, transition: { kind: 'hardcut', owner: 'ai' } },
        { videoId: 'v3', unavailable: false, transition: null },
      ]),
      snapIdOf,
    );

    expect(remote.snapRefs.map((ref) => ref.transition)).toEqual([
      { kind: 'dip', durationMs: 400, owner: 'user', toSnapId: 'snap-v2' },
      { kind: 'hardcut', owner: 'ai', toSnapId: 'snap-v3' },
      undefined,
    ]);
  });

  it('drops a kind this build has never heard of instead of failing the read', () => {
    const remote = mapRemoteMovie(
      dto([
        {
          videoId: 'v1',
          unavailable: false,
          transition: { kind: 'whip', durationMs: 300, owner: 'ai' },
        },
        { videoId: 'v2', unavailable: false },
      ]),
      snapIdOf,
    );
    expect(remote.snapRefs[0].transition).toBeUndefined();
  });
});

describe('sending transitions', () => {
  const movie = (snapRefs: Movie['snapRefs']) => ({
    title: '무비',
    snapRefs,
    style: 'emotional' as const,
    captions: false,
    arranger: 'user' as const,
  });
  const videoIdOf = (snapId: string) => `v-${snapId}`;

  it("sends only the user's picks — the server picks every boundary left out", () => {
    const body = toMovieBody(
      movie([
        {
          snapId: 'a',
          order: 0,
          transition: { kind: 'dip', durationMs: 400, owner: 'user', toSnapId: 'b' },
        },
        {
          snapId: 'b',
          order: 1,
          transition: { kind: 'crossfade', durationMs: 800, owner: 'ai', toSnapId: 'c' },
        },
        { snapId: 'c', order: 2 },
      ]),
      videoIdOf,
    );
    expect(body?.clips.map((clip) => clip.transition)).toEqual([
      { kind: 'dip', durationMs: 400 },
      undefined,
      undefined,
    ]);
  });

  it('does not send a pick whose two cuts were separated', () => {
    const body = toMovieBody(
      movie([
        {
          snapId: 'a',
          order: 0,
          transition: { kind: 'dip', durationMs: 400, owner: 'user', toSnapId: 'b' },
        },
        { snapId: 'c', order: 1 },
        { snapId: 'b', order: 2 },
      ]),
      videoIdOf,
    );
    expect(body?.clips[0].transition).toBeUndefined();
  });
});
