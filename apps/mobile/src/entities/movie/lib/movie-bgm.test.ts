import { DefaultMovieBgm, MovieBgmCatalog } from './movie-bgm';

describe('MovieBgmCatalog', () => {
  it('gives every track a distinct id', () => {
    const ids = MovieBgmCatalog.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('holds the default a movie starts scored with', () => {
    expect(MovieBgmCatalog.some((track) => track.id === DefaultMovieBgm)).toBe(true);
  });
});
