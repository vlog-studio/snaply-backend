import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';

import type { NotificationPreferences } from './notification-preferences';
import { useLocationAlerts } from './use-location-alerts';

jest.mock('@/shared/lib/location', () => ({
  requestForegroundLocationPermission: jest.fn(),
  requestBackgroundLocationPermission: jest.fn(),
  getForegroundLocationPermission: jest.fn(),
  getBackgroundLocationPermission: jest.fn(),
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

const mockRequestForeground = jest.mocked(requestForegroundLocationPermission);
const mockRequestBackground = jest.mocked(requestBackgroundLocationPermission);
const mockGetForeground = jest.mocked(getForegroundLocationPermission);
const mockGetBackground = jest.mocked(getBackgroundLocationPermission);

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

const server: NotificationPreferences = {
  locationAlerts: false,
  movieReady: false,
  quietStart: 22,
  quietEnd: 8,
};

async function render(stored: Partial<NotificationPreferences> = {}) {
  mockGet.mockResolvedValue({ ...server, ...stored });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const rendered = await renderHook(() => useLocationAlerts(), { wrapper });
  await waitFor(() => expect(rendered.result.current.ready).toBe(true));
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of [
    mockRequestForeground,
    mockRequestBackground,
    mockGetForeground,
    mockGetBackground,
  ]) {
    mock.mockResolvedValue(permissionResponse(true));
  }
  mockUpdate.mockImplementation((change) => Promise.resolve({ ...server, ...change }));
});

describe('useLocationAlerts', () => {
  it('turns the account’s switch on only after both location grants succeed', async () => {
    const { result } = await render();

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockRequestForeground).toHaveBeenCalledTimes(1);
    expect(mockRequestBackground).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ locationAlerts: true });
  });

  it.each([
    ['foreground', () => mockRequestForeground.mockResolvedValue(permissionResponse(false))],
    ['background', () => mockRequestBackground.mockResolvedValue(permissionResponse(false))],
  ])('stays off and writes nothing when %s location is refused', async (_which, refuse) => {
    refuse();
    const { result } = await render();

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not ask for background location once foreground is refused', async () => {
    mockRequestForeground.mockResolvedValue(permissionResponse(false));
    const { result } = await render();

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(mockRequestBackground).not.toHaveBeenCalled();
  });

  it('turns off without asking the operating system', async () => {
    const { result } = await render({ locationAlerts: true });

    await act(async () => result.current.setEnabled(false));

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mockUpdate).toHaveBeenCalledWith({ locationAlerts: false });
    expect(mockRequestForeground).not.toHaveBeenCalled();
  });

  it('says so when the account has it on but this device lacks always-on location', async () => {
    mockGetBackground.mockResolvedValue(permissionResponse(false));
    const { result } = await render({ locationAlerts: true });

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(true);
    expect(mockRequestForeground).not.toHaveBeenCalled();
  });
});
