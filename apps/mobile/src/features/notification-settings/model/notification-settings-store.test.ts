import { act, renderHook } from '@testing-library/react-native';

import {
  legacyChoicesFrom,
  migrateNotificationSettings,
  useInterests,
  useReminderFrequency,
  useReminderWindows,
  useSetReminderFrequency,
  useSetReminderWindow,
  useToggleInterest,
} from './notification-settings-store';

const mockStorageSetItem = jest.fn();

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: (...args: unknown[]) => mockStorageSetItem(...args),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

function useSettings() {
  return {
    interests: useInterests(),
    reminderWindows: useReminderWindows(),
    reminderFrequency: useReminderFrequency(),
    toggleInterest: useToggleInterest(),
    setReminderWindow: useSetReminderWindow(),
    setReminderFrequency: useSetReminderFrequency(),
  };
}

describe('notification settings on this device', () => {
  it('persists a reminder window and the daily frequency across updates', async () => {
    const { result } = await renderHook(useSettings);

    await act(async () => {
      result.current.setReminderWindow('evening', false);
      result.current.setReminderFrequency(3);
    });

    expect(result.current.reminderWindows).toEqual({ morning: true, lunch: true, evening: false });
    expect(result.current.reminderFrequency).toBe(3);
    expect(mockStorageSetItem).toHaveBeenCalled();

    await act(async () => {
      result.current.setReminderWindow('evening', true);
      result.current.setReminderFrequency(2);
    });
  });

  it('toggles an interest without duplicates', async () => {
    const { result } = await renderHook(useSettings);

    await act(async () => {
      result.current.toggleInterest('travel');
      result.current.toggleInterest('food');
    });
    expect(result.current.interests).toEqual(['travel', 'food']);

    await act(async () => {
      result.current.toggleInterest('travel');
      result.current.toggleInterest('food');
    });
    expect(result.current.interests).toEqual([]);
  });
});

describe('legacyChoicesFrom', () => {
  it.each([
    // Only what the user changed goes up — a default left alone would overwrite
    // what another device set on the account.
    [
      'both switches on and new quiet hours',
      { enabled: true, movieReady: true, quietStart: 23, quietEnd: 7 },
      { locationAlerts: true, movieReady: true, quietStart: 23, quietEnd: 7 },
    ],
    [
      'one switch on',
      { enabled: false, movieReady: true, quietStart: 22, quietEnd: 8 },
      { movieReady: true },
    ],
    [
      'only the start hour moved',
      { enabled: false, movieReady: false, quietStart: 0, quietEnd: 8 },
      { quietStart: 0 },
    ],
    [
      'everything at the old defaults',
      { enabled: false, movieReady: false, quietStart: 22, quietEnd: 8 },
      null,
    ],
    ['nothing stored', {}, null],
  ])('%s', (_label, v1, expected) => {
    expect(legacyChoicesFrom(v1)).toEqual(expected);
  });
});

describe('migrateNotificationSettings', () => {
  const v1 = {
    enabled: true,
    quietStart: 23,
    quietEnd: 8,
    movieReady: false,
    interests: ['travel'],
    reminderWindows: { morning: false, lunch: true, evening: true },
    reminderFrequency: 3,
  };

  it('turns a v1 build’s chosen preferences into the one-time upload and keeps the device state', () => {
    expect(migrateNotificationSettings(v1, 1)).toEqual({
      interests: ['travel'],
      reminderWindows: { morning: false, lunch: true, evening: true },
      reminderFrequency: 3,
      legacyChoices: { locationAlerts: true, quietStart: 23 },
    });
  });

  it('does not upload a v0 location switch — on was that build’s default, not a choice', () => {
    expect(migrateNotificationSettings(v1, 0)).toMatchObject({ legacyChoices: { quietStart: 23 } });
  });

  it('leaves a current state as it is', () => {
    const v2 = { interests: [], legacyChoices: { movieReady: true } };
    expect(migrateNotificationSettings(v2, 2)).toEqual(v2);
  });
});
