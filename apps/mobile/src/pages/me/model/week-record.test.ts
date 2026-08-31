import { recordedDayCount, weekRecord } from './week-record';

// 2026-08-12 is a Wednesday, so the week under test runs Mon 08-10 … Sun 08-16.
const wednesdayAfternoon = new Date(2026, 7, 12, 15, 30).getTime();

describe('weekRecord', () => {
  it('lights exactly the calendar days a snap was captured on', () => {
    const days = weekRecord(
      [
        new Date(2026, 7, 10, 9).getTime(), // Monday
        new Date(2026, 7, 12, 8).getTime(), // Wednesday (today)
        new Date(2026, 7, 12, 21).getTime(), // Wednesday again — still one day
      ],
      wednesdayAfternoon,
    );

    expect(days.map((day) => day.label)).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(days.map((day) => day.recorded)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(recordedDayCount(days)).toBe(2);
  });

  it('marks today and only today', () => {
    const days = weekRecord([], wednesdayAfternoon);
    expect(days.map((day) => day.isToday)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('excludes the previous week, including its final instant', () => {
    const previousSundayLate = new Date(2026, 7, 9, 23, 59, 59, 999).getTime();
    const mondayMidnight = new Date(2026, 7, 10, 0, 0, 0, 0).getTime();

    const days = weekRecord([previousSundayLate, mondayMidnight], wednesdayAfternoon);
    expect(days.map((day) => day.recorded)).toEqual([
      true, // Monday 00:00 belongs to this week
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('starts the week on Monday even when today is Sunday', () => {
    // 2026-08-16 is the Sunday of the same week.
    const sunday = new Date(2026, 7, 16, 12).getTime();
    const days = weekRecord([new Date(2026, 7, 10, 9).getTime()], sunday);
    expect(days[0].recorded).toBe(true); // Monday 08-10 still in view
    expect(days[6].isToday).toBe(true);
  });
});
