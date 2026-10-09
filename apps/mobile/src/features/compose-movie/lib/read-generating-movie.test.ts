import { ApiError } from '@/shared/api';

import { readGeneratingMovieId } from './read-generating-movie';

describe('readGeneratingMovieId', () => {
  it('reads the running movie off the GENERATION_IN_PROGRESS 409', () => {
    const error = new ApiError('GENERATION_IN_PROGRESS', 'busy', {
      status: 409,
      details: { movieId: 'm-running' },
    });

    expect(readGeneratingMovieId(error)).toBe('m-running');
  });

  it.each([
    ['a non-ApiError', new Error('boom')],
    [
      'a run with no movie',
      new ApiError('GENERATION_IN_PROGRESS', 'x', { status: 409, details: { movieId: null } }),
    ],
    ['details missing entirely', new ApiError('GENERATION_IN_PROGRESS', 'x', { status: 409 })],
    [
      'an empty id',
      new ApiError('GENERATION_IN_PROGRESS', 'x', { status: 409, details: { movieId: '' } }),
    ],
  ])('returns undefined for %s', (_case, error) => {
    expect(readGeneratingMovieId(error)).toBeUndefined();
  });
});
