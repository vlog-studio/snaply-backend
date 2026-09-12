import { act, render } from '@testing-library/react-native';

import { movieHref } from '@/shared/routes';

import { NotificationTapRouter } from './notification-tap-router';
import { SnapLibraryHref } from './notification-target';

const mockNavigate = jest.fn();
let mockNavigatorKey: string | undefined = 'root';
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useRootNavigationState: () => ({ key: mockNavigatorKey }),
}));

let mockAuthenticated = true;
jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => mockAuthenticated,
}));

// The two adapters, reduced to what the router touches: an "opening" answer
// each, and one listener each the test can fire.
type PushMessage = { messageId?: string; data?: Record<string, unknown> };
type LocalResponse = { id: string; data: Record<string, unknown> };
let mockOpeningPush: PushMessage | null = null;
let mockOpeningLocal: LocalResponse | null = null;
const mockPushListeners = new Set<(message: PushMessage) => void>();
const mockLocalListeners = new Set<(response: LocalResponse) => void>();
jest.mock('@/shared/lib/notifications', () => ({
  getOpeningNotification: () => Promise.resolve(mockOpeningPush),
  getOpeningLocalNotificationResponse: () => Promise.resolve(mockOpeningLocal),
  onNotificationOpened: (listener: (message: PushMessage) => void) => {
    mockPushListeners.add(listener);
    return () => mockPushListeners.delete(listener);
  },
  onLocalNotificationResponse: (listener: (response: LocalResponse) => void) => {
    mockLocalListeners.add(listener);
    return () => mockLocalListeners.delete(listener);
  },
}));

const tapPush = (message: PushMessage) =>
  act(async () => mockPushListeners.forEach((listener) => listener(message)));
const tapLocal = (response: LocalResponse) =>
  act(async () => mockLocalListeners.forEach((listener) => listener(response)));
const flush = () => act(async () => {});

describe('NotificationTapRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockNavigatorKey = 'root';
    mockAuthenticated = true;
    mockOpeningPush = null;
    mockOpeningLocal = null;
    mockPushListeners.clear();
    mockLocalListeners.clear();
  });

  it('opens the movie a 완성 알림 names when its push is tapped from the background', async () => {
    await render(<NotificationTapRouter />);

    await tapPush({ messageId: 'p1', data: { kind: 'movie_ready', movieId: 'm1' } });

    expect(mockNavigate).toHaveBeenCalledWith(movieHref('m1'));
  });

  // The whole point of an expiry notice is to reach the library (SNAP-13).
  it('opens the library for an expiry notice', async () => {
    await render(<NotificationTapRouter />);

    await tapPush({ messageId: 'p2', data: { kind: 'snap_expiry', daysBefore: '1' } });

    expect(mockNavigate).toHaveBeenCalledWith(SnapLibraryHref);
  });

  // The failure notice is still presented by the app itself, and a push shown
  // while the app is foregrounded is re-presented locally — both come through
  // the local channel with the same `kind` data.
  it('opens the movie a locally presented notice names', async () => {
    await render(<NotificationTapRouter />);

    await tapLocal({ id: 'l1', data: { kind: 'movie_failed', movieId: 'm2' } });

    expect(mockNavigate).toHaveBeenCalledWith(movieHref('m2'));
  });

  it('reaches the destination when the tap launched the app from a quit state', async () => {
    mockOpeningPush = { messageId: 'p3', data: { kind: 'movie_ready', movieId: 'm3' } };

    await render(<NotificationTapRouter />);
    await flush();

    expect(mockNavigate).toHaveBeenCalledWith(movieHref('m3'));
  });

  it('waits for the navigator and the sign-in, then goes where the cold-start tap pointed', async () => {
    mockNavigatorKey = undefined;
    mockAuthenticated = false;
    mockOpeningPush = { messageId: 'p4', data: { kind: 'movie_ready', movieId: 'm4' } };

    const { rerender } = await render(<NotificationTapRouter />);
    await flush();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockNavigatorKey = 'root';
    await act(async () => rerender(<NotificationTapRouter />));
    expect(mockNavigate).not.toHaveBeenCalled();

    mockAuthenticated = true;
    await act(async () => rerender(<NotificationTapRouter />));
    expect(mockNavigate).toHaveBeenCalledWith(movieHref('m4'));
  });

  // One tap, two reports: the opening query and the live listener can both
  // deliver the launch tap, and the FCM and local channels can both report a
  // push the OS displayed.
  it('acts on one tap once however many channels report it', async () => {
    mockOpeningPush = { messageId: 'p5', data: { kind: 'movie_ready', movieId: 'm5' } };
    await render(<NotificationTapRouter />);
    await flush();

    await tapPush({ messageId: 'p5', data: { kind: 'movie_ready', movieId: 'm5' } });
    await tapLocal({ id: 'l5', data: { kind: 'movie_ready', movieId: 'm5' } });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('opens the same movie again for a later, separate tap', async () => {
    jest.useFakeTimers();
    await render(<NotificationTapRouter />);

    await tapPush({ messageId: 'p6', data: { kind: 'movie_ready', movieId: 'm6' } });
    jest.advanceTimersByTime(5_000);
    await tapPush({ messageId: 'p7', data: { kind: 'movie_ready', movieId: 'm6' } });

    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('leaves a notification it cannot place alone, so the tap only opens the app', async () => {
    await render(<NotificationTapRouter />);

    await tapPush({ messageId: 'p8', data: { kind: 'location_arrival' } });
    await tapPush({ messageId: 'p9' });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', async () => {
    const { unmount } = await render(<NotificationTapRouter />);
    await act(async () => unmount());

    expect(mockPushListeners.size).toBe(0);
    expect(mockLocalListeners.size).toBe(0);
  });
});
