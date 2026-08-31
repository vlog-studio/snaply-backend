import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

/**
 * Owns the user's notification preferences.
 *
 * Most of them are the location-alert settings, which map to the backend user
 * profile fields (`notification_enabled`, `quiet_start`, `quiet_end`,
 * `interests`) and are persisted locally for now; once `PATCH /auth/me` exists,
 * those become a server-backed query/mutation and their local copies are
 * dropped. `movieReady` has no backend field yet — generation runs on the device,
 * so the device is also what announces it — but it is a notification preference
 * and belongs beside the others rather than in a store of its own.
 *
 * Quiet hours are stored as integer hours (0–23), matching the backend.
 *
 * The capture-reminder fields (`reminderWindows`, `reminderFrequency`) persist
 * the user's choice only — no scheduler consumes them yet, and they have no
 * backend field. They live here so the 나 tab's controls survive remounts and
 * restarts instead of silently resetting.
 */

const REMINDER_WINDOW_IDS = ['morning', 'lunch', 'evening'] as const;

export type ReminderWindowId = (typeof REMINDER_WINDOW_IDS)[number];

type NotificationSettingsState = {
  enabled: boolean;
  quietStart: number;
  quietEnd: number;
  interests: string[];
  movieReady: boolean;
  reminderWindows: Record<ReminderWindowId, boolean>;
  reminderFrequency: number;
  setEnabled: (enabled: boolean) => void;
  setQuietStart: (hour: number) => void;
  setQuietEnd: (hour: number) => void;
  toggleInterest: (interest: string) => void;
  setMovieReady: (enabled: boolean) => void;
  setReminderWindow: (window: ReminderWindowId, enabled: boolean) => void;
  setReminderFrequency: (count: number) => void;
};

const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      // Off until asked for, like movieReady: enabling is what runs the location
      // permission flow, so a default of on would prompt cold at first launch.
      enabled: false,
      quietStart: 22,
      quietEnd: 8,
      interests: [],
      // Off until asked for: turning it on is what raises the OS permission
      // prompt, and a default that prompts on the first generation would ask at
      // the worst possible moment.
      movieReady: false,
      reminderWindows: { morning: true, lunch: true, evening: true },
      reminderFrequency: 2,
      setEnabled: (enabled) => set({ enabled }),
      setQuietStart: (quietStart) => set({ quietStart }),
      setQuietEnd: (quietEnd) => set({ quietEnd }),
      toggleInterest: (interest) =>
        set((state) => ({
          interests: state.interests.includes(interest)
            ? state.interests.filter((item) => item !== interest)
            : [...state.interests, interest],
        })),
      setMovieReady: (movieReady) => set({ movieReady }),
      setReminderWindow: (window, enabled) =>
        set((state) => ({ reminderWindows: { ...state.reminderWindows, [window]: enabled } })),
      setReminderFrequency: (reminderFrequency) => set({ reminderFrequency }),
    }),
    {
      name: 'snaply.notification-settings',
      storage: createJSONStorage(() => secureStorage),
      // v1: `enabled` stopped defaulting to true. A persisted `true` from v0 was
      // that default, not a choice the user made (the opt-in switch didn't gate
      // the value yet), so it resets to off; opting back in is one tap.
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<NotificationSettingsState>;
        return version < 1 ? { ...state, enabled: false } : state;
      },
    },
  ),
);

export function useNotificationEnabled(): boolean {
  return useNotificationSettingsStore((state) => state.enabled);
}

export function useSetNotificationEnabled(): (enabled: boolean) => void {
  return useNotificationSettingsStore((state) => state.setEnabled);
}

export function useQuietStart(): number {
  return useNotificationSettingsStore((state) => state.quietStart);
}

export function useQuietEnd(): number {
  return useNotificationSettingsStore((state) => state.quietEnd);
}

export function useSetQuietStart(): (hour: number) => void {
  return useNotificationSettingsStore((state) => state.setQuietStart);
}

export function useSetQuietEnd(): (hour: number) => void {
  return useNotificationSettingsStore((state) => state.setQuietEnd);
}

export function useInterests(): string[] {
  return useNotificationSettingsStore((state) => state.interests);
}

export function useToggleInterest(): (interest: string) => void {
  return useNotificationSettingsStore((state) => state.toggleInterest);
}

export function useReminderWindows(): Record<ReminderWindowId, boolean> {
  return useNotificationSettingsStore((state) => state.reminderWindows);
}

export function useSetReminderWindow(): (window: ReminderWindowId, enabled: boolean) => void {
  return useNotificationSettingsStore((state) => state.setReminderWindow);
}

export function useReminderFrequency(): number {
  return useNotificationSettingsStore((state) => state.reminderFrequency);
}

export function useSetReminderFrequency(): (count: number) => void {
  return useNotificationSettingsStore((state) => state.setReminderFrequency);
}

/** Whether a finished (or broken) generation should raise a notification. */
export function useMovieReadyEnabled(): boolean {
  return useNotificationSettingsStore((state) => state.movieReady);
}

export function useSetMovieReadyEnabled(): (enabled: boolean) => void {
  return useNotificationSettingsStore((state) => state.setMovieReady);
}
