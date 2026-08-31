import type { MovieStyle } from '../model/movie';
import {
  DefaultMovieStyle,
  MovieStyleCatalog,
  movieStyleLabel,
  movieStyleOrDefault,
} from './movie-style';

const everyStyle: MovieStyle[] = ['emotional', 'travel', 'daily'];

describe('MovieStyleCatalog', () => {
  it('describes every style exactly once', () => {
    expect(MovieStyleCatalog.map((option) => option.id).sort()).toEqual([...everyStyle].sort());
  });

  it.each(everyStyle)('gives %s a label, a description, and a swatch', (style) => {
    const option = MovieStyleCatalog.find((entry) => entry.id === style);
    expect(option?.label).toBeTruthy();
    expect(option?.description).toBeTruthy();
    expect(option?.swatch).toHaveLength(2);
  });

  it('leads with the default style', () => {
    expect(MovieStyleCatalog[0].id).toBe(DefaultMovieStyle);
  });

  it('names a style for the picker', () => {
    expect(movieStyleLabel(DefaultMovieStyle)).toBe(MovieStyleCatalog[0].label);
  });
});

describe('movieStyleOrDefault', () => {
  it.each(everyStyle)('keeps %s', (style) => {
    expect(movieStyleOrDefault(style)).toBe(style);
  });

  // Movies stored before 2026-08-07 name one of the four looks the app used to
  // invent. Sending one to the backend would be a 400, so it reads as the
  // default instead — no guess at a closer match.
  it.each(['calm', 'upbeat', 'plain'])('falls back for the retired look %s', (style) => {
    expect(movieStyleOrDefault(style)).toBe(DefaultMovieStyle);
  });

  it('falls back for a missing style', () => {
    expect(movieStyleOrDefault(undefined)).toBe(DefaultMovieStyle);
  });

  it('names the fallback rather than crashing on an unknown style', () => {
    expect(movieStyleLabel('calm')).toBe(movieStyleLabel(DefaultMovieStyle));
  });
});
