/** One track of the BGM catalog. */
export type MovieBgmOption = {
  /** Stored on the movie as `Movie.bgm`. */
  id: string;
  label: string;
};

/**
 * The background tracks a movie can be scored with (concept §6 step ②).
 *
 * **Nothing shows these to the user, and nothing sends one to a run
 * (2026-08-13).** `POST /edit-jobs` takes no track id — the pipeline picks the
 * music from the style preset — so the picker that used to stand in the 세부
 * sheet was choosing something the finished movie then contradicted. The
 * catalog stays because `Movie.bgm` is still stored and templates still name a
 * track: this is the seam a real `GET /bgms` lands on, not a live setting.
 *
 * A local constant until the backend serves that endpoint, which is why
 * `Movie.bgm` is a plain string rather than a union: the catalog is going to
 * come from the server, and a movie must keep pointing at a track this build has
 * never heard of. `무음` is a real choice, not the absence of one — a plain style
 * with no music is a look.
 */
export const MovieBgmCatalog: readonly MovieBgmOption[] = [
  { id: 'lofi-walk', label: 'Lo-fi Walk' },
  { id: 'sunny-side', label: 'Sunny Side' },
  { id: 'night-drift', label: 'Night Drift' },
  { id: 'morning-tape', label: 'Morning Tape' },
  { id: 'silence', label: '무음' },
];

/** What a movie starts scored with, before the user reaches the style step. */
export const DefaultMovieBgm = 'lofi-walk';
