import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useIsAuthenticated } from '@/entities/session';
import {
  configureForegroundNotifications,
  ensureNotificationChannel,
  getFcmToken,
  onFcmTokenRefresh,
  onForegroundMessage,
  presentLocalNotification,
  registerForRemoteMessages,
  hasNotificationPermission,
} from '@/shared/lib/notifications';

import { registerFcmToken } from '../api/register-fcm-token';
import { usePushTokenRegistration } from './use-push-token';

jest.mock('@/entities/session', () => ({ useIsAuthenticated: jest.fn() }));

jest.mock('@/shared/lib/notifications', () => ({
  configureForegroundNotifications: jest.fn(),
  ensureNotificationChannel: jest.fn(),
  getFcmToken: jest.fn(),
  onFcmTokenRefresh: jest.fn(),
  onForegroundMessage: jest.fn(),
  presentLocalNotification: jest.fn(),
  registerForRemoteMessages: jest.fn(),
  hasNotificationPermission: jest.fn(),
}));

jest.mock('../api/register-fcm-token', () => ({ registerFcmToken: jest.fn() }));

const mockIsAuthenticated = useIsAuthenticated as jest.MockedFunction<typeof useIsAuthenticated>;
const mockHasPermission = hasNotificationPermission as jest.MockedFunction<
  typeof hasNotificationPermission
>;
const mockEnsureChannel = ensureNotificationChannel as jest.MockedFunction<
  typeof ensureNotificationChannel
>;
const mockRegisterRemote = registerForRemoteMessages as jest.MockedFunction<
  typeof registerForRemoteMessages
>;
const mockGetToken = getFcmToken as jest.MockedFunction<typeof getFcmToken>;
const mockOnTokenRefresh = onFcmTokenRefresh as jest.MockedFunction<typeof onFcmTokenRefresh>;
const mockOnForegroundMessage = onForegroundMessage as jest.MockedFunction<
  typeof onForegroundMessage
>;
const mockPresentLocal = presentLocalNotification as jest.MockedFunction<
  typeof presentLocalNotification
>;
const mockRegisterToken = registerFcmToken as jest.MockedFunction<typeof registerFcmToken>;
const mockConfigureForeground = configureForegroundNotifications as jest.MockedFunction<
  typeof configureForegroundNotifications
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAuthenticated.mockReturnValue(true);
  mockHasPermission.mockResolvedValue(true);
  mockEnsureChannel.mockResolvedValue(undefined);
  mockRegisterRemote.mockResolvedValue(undefined);
  mockGetToken.mockResolvedValue('token-1');
  mockRegisterToken.mockResolvedValue(undefined);
  mockOnTokenRefresh.mockReturnValue(jest.fn());
  mockOnForegroundMessage.mockReturnValue(jest.fn());
  mockPresentLocal.mockResolvedValue('notification-1');
});

describe('usePushTokenRegistration', () => {
  it('does nothing until a user is authenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false);

    await renderHook(usePushTokenRegistration);
    await Promise.resolve();

    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('stops before native registration when the notification grant is missing', async () => {
    mockHasPermission.mockResolvedValue(false);

    await renderHook(usePushTokenRegistration);
    await waitFor(() => expect(mockHasPermission).toHaveBeenCalled());

    expect(mockConfigureForeground).not.toHaveBeenCalled();
    expect(mockRegisterRemote).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('registers the initial token before subscribing to refresh and foreground messages', async () => {
    await renderHook(usePushTokenRegistration);

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledWith('token-1'));
    expect(mockConfigureForeground).toHaveBeenCalledTimes(1);
    expect(mockEnsureChannel).toHaveBeenCalledTimes(1);
    expect(mockRegisterRemote).toHaveBeenCalledTimes(1);
    expect(mockOnTokenRefresh).toHaveBeenCalledTimes(1);
    expect(mockOnForegroundMessage).toHaveBeenCalledTimes(1);
    expect(mockRegisterToken.mock.invocationCallOrder[0]).toBeLessThan(
      mockOnTokenRefresh.mock.invocationCallOrder[0],
    );
  });

  it('re-registers refreshed tokens and presents foreground notification content', async () => {
    let refresh!: (token: string) => void;
    type ForegroundListener = Parameters<typeof onForegroundMessage>[0];
    let foreground!: ForegroundListener;
    mockOnTokenRefresh.mockImplementation((listener) => {
      refresh = listener;
      return jest.fn();
    });
    mockOnForegroundMessage.mockImplementation((listener) => {
      foreground = listener;
      return jest.fn();
    });
    await renderHook(usePushTokenRegistration);
    await waitFor(() => expect(mockOnForegroundMessage).toHaveBeenCalled());

    await act(async () => {
      refresh('token-2');
      foreground({
        notification: { title: 'Movie ready', body: 'Open Snaply' },
        data: { movieId: 'm1' },
      } as unknown as Parameters<ForegroundListener>[0]);
    });

    expect(mockRegisterToken).toHaveBeenCalledWith('token-2');
    expect(mockPresentLocal).toHaveBeenCalledWith({
      title: 'Movie ready',
      body: 'Open Snaply',
      data: { movieId: 'm1' },
    });
  });

  it('re-checks the grant when the recheck key changes and registers once it is there', async () => {
    mockHasPermission.mockResolvedValue(false);
    const { rerender } = await renderHook(
      ({ recheckKey }: { recheckKey: boolean }) => usePushTokenRegistration({ recheckKey }),
      { initialProps: { recheckKey: false } },
    );
    await waitFor(() => expect(mockHasPermission).toHaveBeenCalledTimes(1));
    expect(mockRegisterToken).not.toHaveBeenCalled();

    mockHasPermission.mockResolvedValue(true);
    await act(async () => rerender({ recheckKey: true }));

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledWith('token-1'));
    expect(mockHasPermission).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes both native listeners on unmount', async () => {
    const unsubscribeRefresh = jest.fn();
    const unsubscribeForeground = jest.fn();
    mockOnTokenRefresh.mockReturnValue(unsubscribeRefresh);
    mockOnForegroundMessage.mockReturnValue(unsubscribeForeground);
    const { unmount } = await renderHook(usePushTokenRegistration);
    await waitFor(() => expect(mockOnForegroundMessage).toHaveBeenCalled());

    await act(async () => unmount());

    expect(unsubscribeRefresh).toHaveBeenCalledTimes(1);
    expect(unsubscribeForeground).toHaveBeenCalledTimes(1);
  });
});
