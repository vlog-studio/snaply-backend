const DayMs = 24 * 60 * 60 * 1000;

/**
 * How long a deleted snap can still come back, as the library's countdown reads
 * a kept copy (`3일 남음`, SNAP-13) — the same words for the same deadline. The
 * last day reads `오늘까지`.
 */
export function daysLeftLabel(restorableUntil: number, now: number): string {
  const days = Math.ceil((restorableUntil - now) / DayMs);
  return days <= 1 ? '오늘까지' : `${days}일 남음`;
}
