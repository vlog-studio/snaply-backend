import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { NotificationPreferences } from '@/features/notification-settings';
import {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';
import {
  hasLocalNotificationPermission,
  requestLocalNotificationPermission,
} from '@/shared/lib/notifications';

import { MeNotificationsPage } from './me-notifications-page';

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const server: NotificationPreferences = {
  locationAlerts: false,
  movieReady: false,
  quietStart: 22,
  quietEnd: 8,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <MeNotificationsPage />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

jest.mock('@/shared/lib/location', () => ({
  requestForegroundLocationPermission: jest.fn(),
  requestBackgroundLocationPermission: jest.fn(),
  getForegroundLocationPermission: jest.fn(),
  getBackgroundLocationPermission: jest.fn(),
}));

jest.mock('@/shared/lib/notifications', () => ({
  requestLocalNotificationPermission: jest.fn().mockResolvedValue(true),
  hasLocalNotificationPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => true,
}));

// The HTTP boundary: the account's preferences (`GET`/`PATCH /auth/me`).
const mockGet = jest.fn<Promise<NotificationPreferences>, []>();
const mockUpdate = jest.fn<Promise<NotificationPreferences>, [Partial<NotificationPreferences>]>();
jest.mock('@/features/notification-settings/api/get-notification-preferences', () => ({
  getNotificationPreferences: () => mockGet(),
}));
jest.mock('@/features/notification-settings/api/update-notification-preferences', () => ({
  updateNotificationPreferences: (change: Partial<NotificationPreferences>) => mockUpdate(change),
}));

const mockLocalNotificationPermission = jest.mocked(requestLocalNotificationPermission);
const mockHasLocalNotificationPermission = jest.mocked(hasLocalNotificationPermission);
const mockForegroundPermission = jest.mocked(requestForegroundLocationPermission);
const mockBackgroundPermission = jest.mocked(requestBackgroundLocationPermission);
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(server);
  mockUpdate.mockImplementation((change) => Promise.resolve({ ...server, ...change }));
  mockHasLocalNotificationPermission.mockResolvedValue(true);
  for (const mock of [
    mockForegroundPermission,
    mockBackgroundPermission,
    mockGetForeground,
    mockGetBackground,
  ]) {
    mock.mockResolvedValue(permissionResponse(true));
  }
});

/** Renders and waits for the account's preferences to arrive. */
async function renderLoaded() {
  await renderPage();
  await waitFor(() =>
    expect(screen.getByLabelText(locationSwitchLabel).props.disabled).toBe(false),
  );
}

// 위치 알림 받기
const locationSwitchLabel = '\uC704\uCE58 \uC54C\uB9BC \uBC1B\uAE30';
// 주변 장소 알림을 받을까요?
const sheetHeading = '\uC8FC\uBCC0 \uC7A5\uC18C \uC54C\uB9BC\uC744 \uBC1B\uC744\uAE4C\uC694?';
const acceptLabel = '\uC54C\uB9BC \uBC1B\uAE30'; // 알림 받기
const declineLabel = '\uC54C\uB9BC \uC548 \uBC1B\uAE30'; // 알림 안 받기

describe('MeNotificationsPage location alerts', () => {
  it('asks in-app first: flipping the switch on opens the sheet without touching the OS', async () => {
    await renderLoaded();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);

    expect(screen.getByText(sheetHeading)).toBeTruthy();
    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(mockBackgroundPermission).not.toHaveBeenCalled();
  });

  it('runs the OS permission requests only after the sheet is accepted, then saves to the account', async () => {
    await renderLoaded();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: acceptLabel }));

    await waitFor(() => expect(mockForegroundPermission).toHaveBeenCalledTimes(1));
    expect(mockBackgroundPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText(locationSwitchLabel).props.value).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith({ locationAlerts: true });
  });

  it('declining the sheet leaves the switch off and asks the OS nothing', async () => {
    await renderLoaded();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: declineLabel }));

    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(screen.getByLabelText(locationSwitchLabel).props.value).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// 무비 완성 알림 받기
const movieSwitchLabel = '\uBB34\uBE44 \uC644\uC131 \uC54C\uB9BC \uBC1B\uAE30';
// 설정에서 권한 켜기
const settingsRowLabel = '\uC124\uC815\uC5D0\uC11C \uAD8C\uD55C \uCF1C\uAE30';
// 시작 시간 늘리기
const quietStartLater = '\uC2DC\uC791 \uC2DC\uAC04 \uB298\uB9AC\uAE30';
// 알림 설정을 바꾸지 못했어요. 다시 시도해 주세요.
const saveErrorText =
  '\uC54C\uB9BC \uC124\uC815\uC744 \uBC14\uAFB8\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.';

describe('MeNotificationsPage movie-ready alerts', () => {
  it('a refused grant leaves the switch off and surfaces the settings row', async () => {
    mockLocalNotificationPermission.mockResolvedValue(false);
    await renderLoaded();

    await fireEvent(screen.getByLabelText(movieSwitchLabel), 'valueChange', true);

    await waitFor(() => expect(screen.getByLabelText(settingsRowLabel)).toBeTruthy());
    expect(screen.getByLabelText(movieSwitchLabel).props.value).toBe(false);
  });

  it('an account switch this device cannot honor stays on and points to the settings', async () => {
    mockGet.mockResolvedValue({ ...server, movieReady: true });
    mockHasLocalNotificationPermission.mockResolvedValue(false);
    await renderLoaded();

    await waitFor(() => expect(screen.getByLabelText(settingsRowLabel)).toBeTruthy());
    expect(screen.getByLabelText(movieSwitchLabel).props.value).toBe(true);
  });
});

describe('MeNotificationsPage account preferences', () => {
  it('holds every control still until the account’s preferences arrive', async () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByLabelText(movieSwitchLabel).props.disabled).toBe(true);
    expect(screen.getByLabelText(locationSwitchLabel).props.disabled).toBe(true);
    expect(screen.getByRole('button', { name: quietStartLater })).toBeDisabled();
  });

  it('a change the server refuses goes back, with a line saying so', async () => {
    mockUpdate.mockRejectedValue(new Error('offline'));
    await renderLoaded();

    await fireEvent.press(screen.getByRole('button', { name: quietStartLater }));

    await waitFor(() => expect(screen.getByText(saveErrorText)).toBeTruthy());
    // The stepper reads the account's hour again, not the one the server refused.
    await waitFor(() => expect(screen.getByText('22:00')).toBeTruthy());
  });
});

// 촬영 리마인더 / 하루 빈도 / 준비 중
const reminderTitle = '촬영 리마인더';
const frequencyTitle = '하루 빈도';
const comingSoon = '준비 중';

describe('MeNotificationsPage capture reminders', () => {
  it('shows the reminder rows as 준비 중 placeholders with no control', async () => {
    await renderLoaded();

    expect(screen.getByText(reminderTitle)).toBeTruthy();
    expect(screen.getByText(frequencyTitle)).toBeTruthy();
    expect(screen.getAllByText(comingSoon)).toHaveLength(2);
    // Only the movie-completion and location switches remain.
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
