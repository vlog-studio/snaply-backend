import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import type { NotificationPreferences } from './notification-preferences';
import { migrateNotificationSettings, useLegacyChoices } from './notification-settings-store';
import { useLegacyChoicesUpload } from './use-legacy-choices-upload';
import { useNotificationPreferences } from './use-notification-preferences';

// A v1 payload as SecureStore would return it: this device had the movie switch
// on and moved the quiet hours, while the location switch was left at its default.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(
      JSON.stringify({
        state: {
          enabled: false,
          quietStart: 23,
          quietEnd: 8,
          interests: [],
          movieReady: true,
          reminderWindows: { morning: true, lunch: true, evening: true },
          reminderFrequency: 2,
        },
        version: 1,
      }),
    ),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => true,
}));

const mockGet = jest.fn<Promise<NotificationPreferences>, []>();
const mockUpdate = jest.fn<Promise<NotificationPreferences>, [Partial<NotificationPreferences>]>();
jest.mock('../api/get-notification-preferences', () => ({
  getNotificationPreferences: () => mockGet(),
}));
jest.mock('../api/update-notification-preferences', () => ({
  updateNotificationPreferences: (change: Partial<NotificationPreferences>) => mockUpdate(change),
}));

const server: NotificationPreferences = {
  locationAlerts: true,
  movieReady: false,
  quietStart: 22,
  quietEnd: 8,
};

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => {
      useLegacyChoicesUpload();
      return { choices: useLegacyChoices(), preferences: useNotificationPreferences() };
    },
    { wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(server);
});

describe('useLegacyChoicesUpload', () => {
  // The store is one per test file, so the refusal runs first: the success after it uploads and clears.
  it('keeps the choices for the next start when the server did not take them', async () => {
    mockUpdate.mockRejectedValue(new Error('offline'));
    const { result } = await render();

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current.choices).toEqual(
      migrateNotificationSettings(
        { enabled: false, quietStart: 23, quietEnd: 8, movieReady: true },
        1,
      ).legacyChoices,
    );
  });

  it('sends only what the device had changed, once, and then forgets it', async () => {
    mockUpdate.mockImplementation((change) => Promise.resolve({ ...server, ...change }));
    const { result } = await render();

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    // The location switch this device left off does not overwrite the account's on.
    expect(mockUpdate).toHaveBeenCalledWith({ movieReady: true, quietStart: 23 });
    await waitFor(() => expect(result.current.choices).toBeNull());
    expect(result.current.preferences).toEqual({ ...server, movieReady: true, quietStart: 23 });
  });
});
