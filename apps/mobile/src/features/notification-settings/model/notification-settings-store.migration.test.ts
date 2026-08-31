import { renderHook, waitFor } from '@testing-library/react-native';

import { useNotificationEnabled, useQuietStart } from './notification-settings-store';

// A v0 payload as SecureStore would return it: `enabled: true` was the store
// default back then, not a choice the user made.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(
      JSON.stringify({
        state: {
          enabled: true,
          quietStart: 23,
          quietEnd: 8,
          interests: [],
          movieReady: false,
          reminderWindows: { morning: true, lunch: true, evening: true },
          reminderFrequency: 2,
        },
        version: 0,
      }),
    ),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('notification settings migration', () => {
  it('resets a v0 enabled flag to off while keeping the rest of the stored state', async () => {
    const { result } = await renderHook(() => ({
      enabled: useNotificationEnabled(),
      quietStart: useQuietStart(),
    }));

    // The non-default quiet hour proves rehydration ran; enabled must still be
    // off because the v0 value was never an opt-in.
    await waitFor(() => expect(result.current.quietStart).toBe(23));
    expect(result.current.enabled).toBe(false);
  });
});
