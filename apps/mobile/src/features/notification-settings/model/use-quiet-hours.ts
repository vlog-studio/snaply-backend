import { useNotificationPreferences } from './use-notification-preferences';
import { useUpdateNotificationPreferences } from './use-update-notification-preferences';

export type QuietHours = {
  /** KST hours 0–23; the server's defaults until the preferences load. */
  start: number;
  end: number;
  /** False until the preferences have loaded — the steppers hold still. */
  ready: boolean;
  setStart: (hour: number) => void;
  setEnd: (hour: number) => void;
  error: string | null;
};

/** The account's quiet hours (조용한 시간), which bound every server push. */
export function useQuietHours(): QuietHours {
  const preferences = useNotificationPreferences();
  const { update, error } = useUpdateNotificationPreferences();

  return {
    start: preferences?.quietStart ?? 22,
    end: preferences?.quietEnd ?? 8,
    ready: preferences !== undefined,
    setStart: (hour) => void update({ quietStart: hour }),
    setEnd: (hour) => void update({ quietEnd: hour }),
    error,
  };
}
