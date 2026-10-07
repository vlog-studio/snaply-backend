import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { secureStorage } from '@/shared/lib/secure-storage';

import type { NotificationPreferences } from './notification-preferences';

/**
 * Owns the notification state that lives on this device only.
 *
 * The alert switches and the quiet hours are not here: they are the account's,
 * held by the server and read through `useNotificationPreferences` (NTF-7,
 * docs/decisions/notification-preferences.md). Builds before that kept them
 * here; what such a build stored and the user had actually chosen waits in
 * `legacyChoices` until `useLegacyChoicesUpload` hands it to the server once.
 *
 * The capture-reminder fields (`reminderWindows`, `reminderFrequency`) persist
 * the user's choice only — no scheduler consumes them yet, and they have no
 * backend field. They live here so the 나 tab's controls survive remounts and
 * restarts instead of silently resetting.
 *
 * `interests` is kept the same way: a choice made in an earlier build, which
 * nothing reads — the 나 tab shows 관심사 as 준비 중 with no picker until
 * something consumes it (backlog A-9). It is not cleared, so it can come back.
 */

const REMINDER_WINDOW_IDS = ['morning', 'lunch', 'evening'] as const;

export type ReminderWindowId = (typeof REMINDER_WINDOW_IDS)[number];

/** Preferences an older build kept on this device and the user had changed. */
export type LegacyChoices = Partial<NotificationPreferences>;

type NotificationSettingsState = {
  interests: string[];
  reminderWindows: Record<ReminderWindowId, boolean>;
  reminderFrequency: number;
  /** Set only by the v2 migration; cleared once the server has them. */
  legacyChoices: LegacyChoices | null;
  toggleInterest: (interest: string) => void;
  setReminderWindow: (window: ReminderWindowId, enabled: boolean) => void;
  setReminderFrequency: (count: number) => void;
  clearLegacyChoices: () => void;
};

/** What a pre-v2 build stored for the preferences that moved to the server. */
type V1Preferences = {
  enabled?: boolean;
  movieReady?: boolean;
  quietStart?: number;
  quietEnd?: number;
};

/**
 * The v1 values the user chose, in the server's terms. A value still at that
 * build's default (both switches off, quiet 22–08) was never chosen, so it is
 * left out — uploading it would overwrite what another device set.
 */
export function legacyChoicesFrom(v1: V1Preferences): LegacyChoices | null {
  const choices: LegacyChoices = {
    ...(v1.enabled === true ? { locationAlerts: true } : null),
    ...(v1.movieReady === true ? { movieReady: true } : null),
    ...(v1.quietStart !== undefined && v1.quietStart !== 22 ? { quietStart: v1.quietStart } : null),
    ...(v1.quietEnd !== undefined && v1.quietEnd !== 8 ? { quietEnd: v1.quietEnd } : null),
  };
  return Object.keys(choices).length > 0 ? choices : null;
}

/** The persisted state of an older version, brought to the current one. */
export function migrateNotificationSettings(
  persisted: unknown,
  version: number,
): Partial<NotificationSettingsState> {
  const { enabled, movieReady, quietStart, quietEnd, ...rest } = (persisted ??
    {}) as V1Preferences & Partial<NotificationSettingsState>;
  if (version >= 2) return rest;
  return {
    ...rest,
    legacyChoices: legacyChoicesFrom({
      // A v0 `enabled: true` was that build's default, not a choice.
      enabled: version < 1 ? false : enabled,
      movieReady,
      quietStart,
      quietEnd,
    }),
  };
}

const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      interests: [],
      reminderWindows: { morning: true, lunch: true, evening: true },
      reminderFrequency: 2,
      legacyChoices: null,
      toggleInterest: (interest) =>
        set((state) => ({
          interests: state.interests.includes(interest)
            ? state.interests.filter((item) => item !== interest)
            : [...state.interests, interest],
        })),
      setReminderWindow: (window, enabled) =>
        set((state) => ({ reminderWindows: { ...state.reminderWindows, [window]: enabled } })),
      setReminderFrequency: (reminderFrequency) => set({ reminderFrequency }),
      clearLegacyChoices: () => set({ legacyChoices: null }),
    }),
    {
      name: 'snaply.notification-settings',
      storage: createJSONStorage(() => secureStorage),
      // v1: `enabled` stopped defaulting to true. A persisted `true` from v0 was
      // that default, not a choice the user made (the opt-in switch didn't gate
      // the value yet), so it reads as off.
      // v2: the switches and quiet hours moved to the server (NTF-7). The ones
      // the user had changed become `legacyChoices` for one upload; the device
      // copies are dropped.
      version: 2,
      migrate: (persisted, version) =>
        migrateNotificationSettings(persisted, version) as NotificationSettingsState,
    },
  ),
);

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

export function useLegacyChoices(): LegacyChoices | null {
  return useNotificationSettingsStore((state) => state.legacyChoices);
}

export function useClearLegacyChoices(): () => void {
  return useNotificationSettingsStore((state) => state.clearLegacyChoices);
}
