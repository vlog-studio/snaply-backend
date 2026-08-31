import type { Location } from '@/entities/location';
import {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  hasStartedGeofencing,
  startGeofencing,
  stopGeofencing,
} from '@/shared/lib/location';

import { selectNearestRegions } from '../lib/select-nearest-regions';
import {
  hasGeofencePermissions,
  startGeofenceMonitoring,
  stopGeofenceMonitoring,
} from './geofence-monitor';
import { GEOFENCE_TASK_NAME } from './geofence-task';

jest.mock('@/shared/lib/location', () => ({
  hasStartedGeofencing: jest.fn(),
  getBackgroundLocationPermission: jest.fn(),
  getForegroundLocationPermission: jest.fn(),
  startGeofencing: jest.fn(),
  stopGeofencing: jest.fn(),
}));

jest.mock('./geofence-task', () => ({
  GEOFENCE_TASK_NAME: 'snaply-geofence-monitor',
}));

const foregroundPermission = getForegroundLocationPermission as jest.MockedFunction<
  typeof getForegroundLocationPermission
>;
const backgroundPermission = getBackgroundLocationPermission as jest.MockedFunction<
  typeof getBackgroundLocationPermission
>;
const hasStarted = hasStartedGeofencing as jest.MockedFunction<typeof hasStartedGeofencing>;
const start = startGeofencing as jest.MockedFunction<typeof startGeofencing>;
const stop = stopGeofencing as jest.MockedFunction<typeof stopGeofencing>;

const origin = { latitude: 37.5, longitude: 127 };
const nearby: Location[] = [
  {
    id: 'loc-1',
    name: 'Nearby',
    latitude: 37.501,
    longitude: 127,
    radiusMeters: 200,
    category: 'test',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  foregroundPermission.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted' as Awaited<ReturnType<typeof getForegroundLocationPermission>>['status'],
    expires: 'never',
  });
  backgroundPermission.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted' as Awaited<ReturnType<typeof getBackgroundLocationPermission>>['status'],
    expires: 'never',
  });
  hasStarted.mockResolvedValue(false);
  start.mockResolvedValue(undefined);
  stop.mockResolvedValue(undefined);
});

describe('hasGeofencePermissions', () => {
  it('stops before reading background access when foreground access is missing', async () => {
    foregroundPermission.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied' as Awaited<ReturnType<typeof getForegroundLocationPermission>>['status'],
      expires: 'never',
    });

    await expect(hasGeofencePermissions()).resolves.toBe(false);
    expect(backgroundPermission).not.toHaveBeenCalled();
  });

  it('reports missing background access even when foreground access is granted', async () => {
    backgroundPermission.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'denied' as Awaited<ReturnType<typeof getBackgroundLocationPermission>>['status'],
      expires: 'never',
    });

    await expect(hasGeofencePermissions()).resolves.toBe(false);
  });

  it('confirms monitoring only when both permission levels are already granted', async () => {
    await expect(hasGeofencePermissions()).resolves.toBe(true);
    expect(foregroundPermission).toHaveBeenCalledTimes(1);
    expect(backgroundPermission).toHaveBeenCalledTimes(1);
  });
});

describe('geofence monitoring lifecycle', () => {
  it('replaces the active native region set with the nearest current locations', async () => {
    hasStarted.mockResolvedValue(true);

    await startGeofenceMonitoring(nearby, origin);

    expect(stop).toHaveBeenCalledWith(GEOFENCE_TASK_NAME);
    expect(start).toHaveBeenCalledWith(GEOFENCE_TASK_NAME, selectNearestRegions(nearby, origin));
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
  });

  it('does not disturb native monitoring when there are no candidate locations', async () => {
    await startGeofenceMonitoring([], origin);

    expect(hasStarted).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('stops only when the geofence task is active', async () => {
    await stopGeofenceMonitoring();
    expect(stop).not.toHaveBeenCalled();

    hasStarted.mockResolvedValue(true);
    await stopGeofenceMonitoring();
    expect(stop).toHaveBeenCalledWith(GEOFENCE_TASK_NAME);
  });
});
