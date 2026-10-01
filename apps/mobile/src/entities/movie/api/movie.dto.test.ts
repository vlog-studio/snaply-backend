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

describe('trim owners', () => {
  it('reads an edit-draft window back as ai, and everything else as the user’s', () => {
    const remote = mapRemoteMovie(
      dto([
        { videoId: 'v1', startMs: 400, endMs: 2600, trimOwner: 'ai', unavailable: false },
        { videoId: 'v2', trimOwner: 'ai', unavailable: false },
        { videoId: 'v3', startMs: 0, endMs: 1000, trimOwner: 'user', unavailable: false },
        // A server older than trim owners sends none.
        { videoId: 'v4', startMs: 0, endMs: 1000, unavailable: false },
      ]),
      snapIdOf,
    );
    expect(remote.snapRefs.map((ref) => ref.trimOwner)).toEqual(['ai', 'ai', undefined, undefined]);
  });

  it('sends ai only for the draft’s windows — a cut left out reads as the user’s on the server', () => {
    const body = toMovieBody(
      {
        title: '무비',
        style: 'daily',
        captions: false,
        arranger: 'ai',
        snapRefs: [
          { snapId: 'a', order: 0, trim: { startSec: 0.4, endSec: 2.6 }, trimOwner: 'ai' },
          { snapId: 'b', order: 1, trimOwner: 'ai' },
          { snapId: 'c', order: 2, trim: { startSec: 0, endSec: 1 } },
        ],
      },
      (snapId) => `v-${snapId}`,
    );
    expect(body?.clips).toEqual([
      { videoId: 'v-a', startMs: 400, endMs: 2600, trimOwner: 'ai' },
      { videoId: 'v-b', trimOwner: 'ai' },
      { videoId: 'v-c', startMs: 0, endMs: 1000 },
    ]);
  });
});
