import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import {
  hasLocalNotificationPermission,
  requestLocalNotificationPermission,
} from '@/shared/lib/notifications';

import type { NotificationPreferences } from './notification-preferences';
import { useMovieReadyAlerts } from './use-movie-ready-alerts';

jest.mock('@/shared/lib/notifications', () => ({
  requestLocalNotificationPermission: jest.fn(),
  hasLocalNotificationPermission: jest.fn(),
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

const mockRequestPermission = jest.mocked(requestLocalNotificationPermission);
const mockHasPermission = jest.mocked(hasLocalNotificationPermission);

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
  const rendered = await renderHook(() => useMovieReadyAlerts(), { wrapper });
  await waitFor(() => expect(rendered.result.current.ready).toBe(true));
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHasPermission.mockResolvedValue(true);
  mockUpdate.mockImplementation((change) => Promise.resolve({ ...server, ...change }));
});

describe('useMovieReadyAlerts', () => {
  it('turns the account’s switch on only after the operating system grants permission', async () => {
    mockRequestPermission.mockResolvedValue(true);
    const { result } = await render();

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ movieReady: true });
    expect(result.current.blocked).toBe(false);
  });

  it('leaves the switch off, writes nothing, and exposes the denial', async () => {
    mockRequestPermission.mockResolvedValue(false);
    const { result } = await render();

    await act(async () => result.current.setEnabled(true));

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('turns off without asking the operating system again', async () => {
    const { result } = await render({ movieReady: true });

    await act(async () => result.current.setEnabled(false));

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mockUpdate).toHaveBeenCalledWith({ movieReady: false });
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('says so when the account has it on but this device has no notification grant', async () => {
    // A new device, or notifications turned off in the OS settings.
    mockHasPermission.mockResolvedValue(false);
    const { result } = await render({ movieReady: true });

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.enabled).toBe(true);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('holds still until the preferences have loaded', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const { result } = await renderHook(() => useMovieReadyAlerts(), { wrapper });

    expect(result.current).toMatchObject({ ready: false, enabled: false, blocked: false });
  });
});
