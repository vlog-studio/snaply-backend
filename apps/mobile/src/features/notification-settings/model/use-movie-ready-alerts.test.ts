import { act, renderHook, waitFor } from '@testing-library/react-native';

import { requestLocalNotificationPermission } from '@/shared/lib/notifications';

import { useSetMovieReadyEnabled } from './notification-settings-store';
import { useMovieReadyAlerts } from './use-movie-ready-alerts';

jest.mock('@/shared/lib/notifications', () => ({
  requestLocalNotificationPermission: jest.fn(),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockRequestPermission = requestLocalNotificationPermission as jest.MockedFunction<
  typeof requestLocalNotificationPermission
>;

function useAlertsWithReset() {
  return {
    alerts: useMovieReadyAlerts(),
    resetStoredPreference: useSetMovieReadyEnabled(),
  };
}

describe('useMovieReadyAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores the opt-in only after the operating system grants permission', async () => {
    mockRequestPermission.mockResolvedValue(true);
    const { result } = await renderHook(useAlertsWithReset);

    await act(async () => {
      result.current.alerts.setEnabled(true);
    });

    await waitFor(() => expect(result.current.alerts.enabled).toBe(true));
    expect(result.current.alerts.blocked).toBe(false);

    await act(async () => result.current.resetStoredPreference(false));
  });

  it('leaves the preference off and exposes the denial', async () => {
    mockRequestPermission.mockResolvedValue(false);
    const { result } = await renderHook(useAlertsWithReset);

    await act(async () => {
      result.current.alerts.setEnabled(true);
    });

    await waitFor(() => expect(result.current.alerts.blocked).toBe(true));
    expect(result.current.alerts.enabled).toBe(false);
  });

  it('turns off synchronously without asking the operating system again', async () => {
    const { result } = await renderHook(useAlertsWithReset);
    await act(async () => result.current.resetStoredPreference(true));

    await act(async () => {
      result.current.alerts.setEnabled(false);
    });

    expect(result.current.alerts.enabled).toBe(false);
    expect(result.current.alerts.blocked).toBe(false);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });
});
