/**
 * Longest a hand-given movie name may be. The rename control caps its input at
 * the same value, so the two never disagree about what will be saved.
 */
export const MovieTitleMaxLength = 20;

function monthDay(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The title a movie is saved with.
 *
 * Naming is optional by design: demanding a name at the moment the user finally
 * has material is friction, so a blank one becomes `무비 08-03` — the day it was
 * started. Whitespace-only counts as blank. Making several movies in one day
 * would collide, so a taken default gains a suffix (`무비 08-03 (2)`).
 *
 * A name past the cap is cut rather than refused. The rename control already
 * caps what can be typed, so an over-long value only arrives from a paste or a
 * stale caller, and neither is worth failing a movie creation over.
 */
export function movieTitle(
  title: string | undefined,
  createdAt: number,
  taken: ReadonlySet<string> = EmptyTitles,
): string {
  const trimmed = title?.trim() ?? '';
  if (trimmed.length > 0) return trimmed.slice(0, MovieTitleMaxLength);

  const base = `무비 ${monthDay(createdAt)}`; // 무비
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base} (${suffix})`)) suffix += 1;
  return `${base} (${suffix})`;
}

const EmptyTitles: ReadonlySet<string> = new Set();
