import type { MovieStyle } from '../model/movie';

/** One entry of the style catalog, as the style step draws it. */
export type MovieStyleOption = {
  id: MovieStyle;
  label: string;
  /** One line on what the style does to the footage. */
  description: string;
  /** Two tones for the card's swatch, top then bottom. */
  swatch: readonly [string, string];
};

/**
 * What each style is. Keyed by `MovieStyle` rather than listed, so adding a
 * style to the union fails to compile until it is described here.
 *
 * The labels are the backend presets' own names, and the descriptions state what
 * its pipeline really does to the footage — the color filter and the cut
 * transition each preset runs (`ai-worker`'s `pipeline/editor.py`). They are
 * written from that table rather than invented, because a style card that
 * promises a look the renderer does not produce is a lie the user only finds out
 * about after a forty-second wait.
 *
 * The swatch tones are the styles' own identity colors, deliberately outside the
 * app palette: they stand for three different looks, which is the one thing a
 * single-accent palette cannot express.
 */
const StyleOptions: Record<MovieStyle, Omit<MovieStyleOption, 'id'>> = {
  daily: { label: '일상', description: '원본 색감 · 컷 편집', swatch: ['#5C6470', '#252A31'] },
  emotional: {
    label: '감성',
    description: '차분한 색감 · 부드러운 전환',
    swatch: ['#7A5A8C', '#301F3C'],
  },
  travel: {
    label: '여행',
    description: '밝은 색감 · 빠른 컷 전환',
    swatch: ['#C4562A', '#6B2A12'],
  },
};

/** Presentation order, `daily` first as the default. */
const StyleOrder: readonly MovieStyle[] = ['daily', 'emotional', 'travel'];

/**
 * The three styles a movie can be generated with (concept §6 step ②).
 *
 * A local constant until the backend serves `GET /styles`, but no longer a local
 * *invention*: the entries are the presets `POST /edit-jobs` accepts.
 */
export const MovieStyleCatalog: readonly MovieStyleOption[] = StyleOrder.map((id) => ({
  id,
  ...StyleOptions[id],
}));

/**
 * What a movie starts as, before the user reaches the style step.
 *
 * `daily` on purpose: it is also what the backend falls back to for a preset it
 * does not recognize, so the app's default and the server's agree.
 */
export const DefaultMovieStyle: MovieStyle = 'daily';

/**
 * The style a stored movie is really generated with.
 *
 * Movies written before 2026-08-07 carry one of the four looks the app used to
 * invent (`calm`/`upbeat`/`plain`/`emotional`), and the local store has no
 * migration step — so `Movie.style` is only as trustworthy as the build that
 * wrote it. Every reader goes through here, and an unrecognized value reads as
 * {@link DefaultMovieStyle} rather than crashing a style card or being sent to a
 * backend that would reject it.
 *
 * `emotional` survived the change and keeps its movies; the other three land on
 * the default. Nothing tries to guess a closer match — the old looks and the new
 * presets classify by different things, and a guess would silently restyle a
 * movie the user had already settled.
 */
export function movieStyleOrDefault(style: string | undefined): MovieStyle {
  return style !== undefined && style in StyleOptions ? (style as MovieStyle) : DefaultMovieStyle;
}

export function movieStyleLabel(style: string | undefined): string {
  return StyleOptions[movieStyleOrDefault(style)].label;
}
