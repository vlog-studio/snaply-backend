import { MovieTitleMaxLength } from '@/entities/movie';

import { renameMovieSchema } from './rename-movie-schema';

describe('renameMovieSchema', () => {
  it.each([
    ['a hand-given name', '제주 이틀', true],
    // Blank is the "call it after the day it was started" case, not an error.
    ['a blank name', '', true],
    ['a name at the cap', 'x'.repeat(MovieTitleMaxLength), true],
    ['a name past the cap, as a paste would arrive', 'x'.repeat(MovieTitleMaxLength + 1), false],
  ])('accepts %s: %p', (_name, title, expected) => {
    expect(renameMovieSchema.safeParse({ title }).success).toBe(expected);
  });
});
