import { MovieTitleMaxLength, movieTitle } from './movie-title';

// 2026-08-03 09:00 local.
const createdAt = new Date(2026, 7, 3, 9).getTime();

describe('movieTitle', () => {
  it('keeps a given name', () => {
    expect(movieTitle('제주 이틀', createdAt)).toBe('제주 이틀');
  });

  it('trims surrounding whitespace', () => {
    expect(movieTitle('  제주 이틀  ', createdAt)).toBe('제주 이틀');
  });

  it.each([undefined, '', '   '])('names a blank title after the day: %j', (title) => {
    expect(movieTitle(title, createdAt)).toBe('무비 08-03');
  });

  it('suffixes a default that is already taken', () => {
    expect(movieTitle(undefined, createdAt, new Set(['무비 08-03']))).toBe('무비 08-03 (2)');
    expect(movieTitle(undefined, createdAt, new Set(['무비 08-03', '무비 08-03 (2)']))).toBe(
      '무비 08-03 (3)',
    );
  });

  it('never suffixes a name the user gave', () => {
    expect(movieTitle('제주 이틀', createdAt, new Set(['제주 이틀']))).toBe('제주 이틀');
  });

  it('cuts an over-long name instead of refusing it', () => {
    const long = 'x'.repeat(MovieTitleMaxLength + 5);
    expect(movieTitle(long, createdAt)).toHaveLength(MovieTitleMaxLength);
  });
});
