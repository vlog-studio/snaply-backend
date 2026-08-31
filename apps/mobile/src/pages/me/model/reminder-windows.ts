import type { ReminderWindowId } from '@/features/notification-settings';

/**
 * The three capture-reminder windows, in day order. The 나 tab's 알림 summary
 * row and the 알림 detail screen both render from this one list so the labels
 * cannot drift apart.
 */
export const reminderWindowOptions: readonly {
  id: ReminderWindowId;
  label: string;
  time: string;
}[] = [
  { id: 'morning', label: '아침', time: '08:00 – 10:00' },
  { id: 'lunch', label: '점심', time: '12:00 – 14:00' },
  { id: 'evening', label: '저녁', time: '18:00 – 21:00' },
];
