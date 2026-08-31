import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';

import { useSetNotificationEnabled } from './notification-settings-store';
import { useLocationAlerts } from './use-location-alerts';

jest.mock('@/shared/lib/location', () => ({
  requestForegroundLocationPermission: jest.fn(),
  requestBackgroundLocationPermission: jest.fn(),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockForegroundPermission = requestForegroundLocationPermission as jest.MockedFunction<
  typeof requestForegroundLocationPermission
>;
const mockBackgroundPermission = requestBackgroundLocationPermission as jest.MockedFunction<
  typeof requestBackgroundLocationPermission
>;

function permissionResponse(granted: boolean) {
  return {
    granted,
    canAskAgain: true,
    status: (granted ? 'granted' : 'denied') as Awaited<
      ReturnType<typeof requestForegroundLocationPermission>
    >['status'],
    expires: 'never' as const,
  };
}

function useAlertsWithReset() {
  return {
    alerts: useLocationAlerts(),
    resetStoredPreference: useSetNotificationEnabled(),
  };
}

describe('useLocationAlerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockForegroundPermission.mockResolvedValue(permissionResponse(true));
    mockBackgroundPermission.mockResolvedValue(permissionResponse(true));
  });

  it('stores the opt-in only after both location grants succeed', async () => {
    const { result } = await renderHook(useAlertsWithReset);
    await act(async () => result.current.resetStoredPreference(false));

    await act(async () => {
      result.current.alerts.setEnabled(true);
    });

    await waitFor(() => expect(result.current.alerts.enabled).toBe(true));
    expect(result.current.alerts.blocked).toBe(false);
  });

  it('leaves the preference off when foreground access is denied, without asking for background', async () => {
    mockForegroundPermission.mockResolvedValue(permissionResponse(false));
    const { result } = await renderHook(useAlertsWithReset);
    await act(async () => result.current.resetStoredPreference(false));

    await act(async () => {
      result.current.alerts.setEnabled(true);
    });

    await waitFor(() => expect(result.current.alerts.blocked).toBe(true));
    expect(result.current.alerts.enabled).toBe(false);
    expect(mockBackgroundPermission).not.toHaveBeenCalled();
  });

  it('leaves the preference off when background access is denied', async () => {
    mockBackgroundPermission.mockResolvedValue(permissionResponse(false));
    const { result } = await renderHook(useAlertsWithReset);
    await act(async () => result.current.resetStoredPreference(false));

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
    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(mockBackgroundPermission).not.toHaveBeenCalled();

    await act(async () => result.current.resetStoredPreference(true));
  });
});
