/**
 * One column of the 나 tab's weekly record: a calendar day of the current
 * Monday-start week and whether at least one snap was captured on it.
 */
export type WeekDayRecord = {
  /** Korean day-of-week column label, 월 through 일. */
  label: string;
  recorded: boolean;
  isToday: boolean;
};

const dayLabels = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * The current calendar week (Monday-start, device-local time) as seven
 * day records, lit where any of `capturedAts` falls on that day.
 *
 * A calendar week rather than a rolling seven days, because the hero copy
 * says "이번 주" and the ring must not claim more than the label does.
 */
export function weekRecord(
  capturedAts: readonly number[],
  now: number = Date.now(),
): WeekDayRecord[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // getDay() counts from Sunday 0; shift so Monday is 0.
  const mondayOffset = (today.getDay() + 6) % 7;

  return dayLabels.map((label, index) => {
    const dayStart = new Date(today);
    dayStart.setDate(today.getDate() - mondayOffset + index);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const start = dayStart.getTime();
    const end = dayEnd.getTime();
    return {
      label,
      recorded: capturedAts.some((at) => at >= start && at < end),
      isToday: start === today.getTime(),
    };
  });
}

export function recordedDayCount(days: readonly WeekDayRecord[]): number {
  return days.filter((day) => day.recorded).length;
}
