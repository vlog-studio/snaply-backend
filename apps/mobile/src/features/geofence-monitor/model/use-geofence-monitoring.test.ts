import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { locationQueries, type Location } from '@/entities/location';
import { useIsAuthenticated } from '@/entities/session';
import {
  getBackgroundLocationPermission,
  getCurrentCoordinates,
  getForegroundLocationPermission,
  hasStartedGeofencing,
  startGeofencing,
  stopGeofencing,
} from '@/shared/lib/location';

import { GEOFENCE_TASK_NAME } from './geofence-task';
import { useGeofenceMonitoring } from './use-geofence-monitoring';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('@/entities/session', () => ({ useIsAuthenticated: jest.fn() }));

jest.mock('@/shared/api', () => ({ apiRequest: jest.fn() }));

jest.mock('@/shared/lib/location', () => ({
  getBackgroundLocationPermission: jest.fn(),
  getCurrentCoordinates: jest.fn(),
  getForegroundLocationPermission: jest.fn(),
  hasStartedGeofencing: jest.fn(),
  startGeofencing: jest.fn(),
  stopGeofencing: jest.fn(),
}));

jest.mock('./geofence-task', () => ({
  GEOFENCE_TASK_NAME: 'snaply-geofence-monitor',
}));

const mockIsAuthenticated = useIsAuthenticated as jest.MockedFunction<typeof useIsAuthenticated>;
const mockGetCurrentCoordinates = getCurrentCoordinates as jest.MockedFunction<
  typeof getCurrentCoordinates
>;
const mockForegroundPermission = getForegroundLocationPermission as jest.MockedFunction<
  typeof getForegroundLocationPermission
>;
const mockBackgroundPermission = getBackgroundLocationPermission as jest.MockedFunction<
  typeof getBackgroundLocationPermission
>;
const mockHasStarted = hasStartedGeofencing as jest.MockedFunction<typeof hasStartedGeofencing>;
const mockStart = startGeofencing as jest.MockedFunction<typeof startGeofencing>;
const mockStop = stopGeofencing as jest.MockedFunction<typeof stopGeofencing>;

const origin = { latitude: 37.5, longitude: 127 };
const nearbyLocations: Location[] = [
  {
    id: 'loc-1',
    name: 'Nearby',
    latitude: 37.501,
    longitude: 127,
    radiusMeters: 200,
    category: 'test',
  },
];

function createQueryWrapper(locations: Location[] = nearbyLocations) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(locationQueries.nearby(origin).queryKey, locations);

  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  mockIsAuthenticated.mockReturnValue(true);
  mockForegroundPermission.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted' as Awaited<ReturnType<typeof getForegroundLocationPermission>>['status'],
    expires: 'never',
  });
  mockBackgroundPermission.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted' as Awaited<ReturnType<typeof getBackgroundLocationPermission>>['status'],
    expires: 'never',
  });
  mockGetCurrentCoordinates.mockResolvedValue(origin);
  mockHasStarted.mockResolvedValue(false);
  mockStart.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
});

describe('useGeofenceMonitoring', () => {
  it('uses real query and monitoring composition to start the nearest cached regions', async () => {
    const { wrapper } = createQueryWrapper();

    await renderHook(() => useGeofenceMonitoring({ enabled: true }), { wrapper });

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, [
        {
          identifier: 'loc-1',
          latitude: 37.501,
          longitude: 127,
          radius: 200,
          notifyOnEnter: true,
          notifyOnExit: false,
        },
      ]),
    );
    expect(mockForegroundPermission).toHaveBeenCalledTimes(1);
    expect(mockBackgroundPermission).toHaveBeenCalledTimes(1);
  });

  it('stops active monitoring when the location-alert setting is disabled', async () => {
    mockHasStarted.mockResolvedValue(true);
    const { wrapper } = createQueryWrapper();

    await renderHook(() => useGeofenceMonitoring({ enabled: false }), { wrapper });

    await waitFor(() => expect(mockStop).toHaveBeenCalledWith(GEOFENCE_TASK_NAME));
    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('stops active monitoring when the session is signed out', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    mockHasStarted.mockResolvedValue(true);
    const { wrapper } = createQueryWrapper();

    await renderHook(() => useGeofenceMonitoring({ enabled: true }), { wrapper });

    await waitFor(() => expect(mockStop).toHaveBeenCalledWith(GEOFENCE_TASK_NAME));
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('does not resolve locations when foreground permission is missing', async () => {
    mockForegroundPermission.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied' as Awaited<ReturnType<typeof getForegroundLocationPermission>>['status'],
      expires: 'never',
    });
    const { wrapper } = createQueryWrapper();

    await renderHook(() => useGeofenceMonitoring({ enabled: true }), { wrapper });

    await waitFor(() => expect(mockForegroundPermission).toHaveBeenCalled());
    expect(mockBackgroundPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentCoordinates).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('does not start a late monitor after the owner unmounts', async () => {
    let resolveCoordinates!: (value: typeof origin) => void;
    mockGetCurrentCoordinates.mockReturnValue(
      new Promise((resolve) => {
        resolveCoordinates = resolve;
      }),
    );
    const { wrapper } = createQueryWrapper();
    const { unmount } = await renderHook(() => useGeofenceMonitoring({ enabled: true }), {
      wrapper,
    });
    await waitFor(() => expect(mockGetCurrentCoordinates).toHaveBeenCalled());

    unmount();
    resolveCoordinates(origin);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('is a no-op on web', async () => {
    (Platform as { OS: string }).OS = 'web';
    const { wrapper } = createQueryWrapper();

    await renderHook(() => useGeofenceMonitoring({ enabled: true }), { wrapper });
    await Promise.resolve();

    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
  });
});
