import { act, renderHook } from '@testing-library/react-native';

import {
  useInterests,
  useMovieReadyEnabled,
  useNotificationEnabled,
  useQuietEnd,
  useQuietStart,
  useReminderFrequency,
  useReminderWindows,
  useSetMovieReadyEnabled,
  useSetNotificationEnabled,
  useSetQuietEnd,
  useSetQuietStart,
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
    enabled: useNotificationEnabled(),
    quietStart: useQuietStart(),
    quietEnd: useQuietEnd(),
    interests: useInterests(),
    movieReady: useMovieReadyEnabled(),
    reminderWindows: useReminderWindows(),
    reminderFrequency: useReminderFrequency(),
    setEnabled: useSetNotificationEnabled(),
    setQuietStart: useSetQuietStart(),
    setQuietEnd: useSetQuietEnd(),
    toggleInterest: useToggleInterest(),
    setMovieReady: useSetMovieReadyEnabled(),
    setReminderWindow: useSetReminderWindow(),
    setReminderFrequency: useSetReminderFrequency(),
  };
}

describe('notification settings', () => {
  it('starts with every prompting preference off until the user opts in', async () => {
    const { result } = await renderHook(useSettings);

    expect(result.current).toMatchObject({
      enabled: false,
      quietStart: 22,
      quietEnd: 8,
      interests: [],
      movieReady: false,
      reminderWindows: { morning: true, lunch: true, evening: true },
      reminderFrequency: 2,
    });
  });

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

  it('updates product preferences and toggles an interest without duplicates', async () => {
    const { result } = await renderHook(useSettings);

    await act(async () => {
      result.current.setEnabled(false);
      result.current.setQuietStart(23);
      result.current.setQuietEnd(7);
      result.current.toggleInterest('travel');
      result.current.toggleInterest('food');
      result.current.setMovieReady(true);
    });

    expect(result.current).toMatchObject({
      enabled: false,
      quietStart: 23,
      quietEnd: 7,
      interests: ['travel', 'food'],
      movieReady: true,
    });

    await act(async () => {
      result.current.toggleInterest('travel');
    });
    expect(result.current.interests).toEqual(['food']);
    expect(mockStorageSetItem).toHaveBeenCalled();

    await act(async () => {
      result.current.setEnabled(true);
      result.current.setQuietStart(22);
      result.current.setQuietEnd(8);
      result.current.toggleInterest('food');
      result.current.setMovieReady(false);
    });
  });
});
