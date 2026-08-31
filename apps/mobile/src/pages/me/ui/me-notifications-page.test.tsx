import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSetNotificationEnabled } from '@/features/notification-settings';
import {
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '@/shared/lib/location';
import { requestLocalNotificationPermission } from '@/shared/lib/notifications';

import { MeNotificationsPage } from './me-notifications-page';

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderPage() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MeNotificationsPage />
    </SafeAreaProvider>,
  );
}

jest.mock('@/shared/lib/location', () => ({
  requestForegroundLocationPermission: jest.fn(),
  requestBackgroundLocationPermission: jest.fn(),
}));

jest.mock('@/shared/lib/notifications', () => ({
  requestLocalNotificationPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockLocalNotificationPermission = requestLocalNotificationPermission as jest.MockedFunction<
  typeof requestLocalNotificationPermission
>;
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

// 위치 알림 받기
const locationSwitchLabel = '\uC704\uCE58 \uC54C\uB9BC \uBC1B\uAE30';
// 주변 스팟 알림을 받을까요?
const sheetHeading = '\uC8FC\uBCC0 \uC2A4\uD31F \uC54C\uB9BC\uC744 \uBC1B\uC744\uAE4C\uC694?';
const acceptLabel = '\uC54C\uB9BC \uBC1B\uAE30'; // 알림 받기
const declineLabel = '\uC54C\uB9BC \uC548 \uBC1B\uAE30'; // 알림 안 받기

describe('MeNotificationsPage location alerts', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockForegroundPermission.mockResolvedValue(permissionResponse(true));
    mockBackgroundPermission.mockResolvedValue(permissionResponse(true));
    // The store is a module singleton — put the preference back to off so an
    // opt-in from one test cannot leak into the next.
    const { result } = await renderHook(() => useSetNotificationEnabled());
    await act(async () => result.current(false));
  });

  it('asks in-app first: flipping the switch on opens the sheet without touching the OS', async () => {
    await renderPage();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);

    expect(screen.getByText(sheetHeading)).toBeTruthy();
    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(mockBackgroundPermission).not.toHaveBeenCalled();
  });

  it('runs the OS permission requests only after the sheet is accepted', async () => {
    await renderPage();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: acceptLabel }));

    await waitFor(() => expect(mockForegroundPermission).toHaveBeenCalledTimes(1));
    expect(mockBackgroundPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText(locationSwitchLabel).props.value).toBe(true));
  });

  it('declining the sheet leaves the switch off and asks the OS nothing', async () => {
    await renderPage();

    await fireEvent(screen.getByLabelText(locationSwitchLabel), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: declineLabel }));

    expect(mockForegroundPermission).not.toHaveBeenCalled();
    expect(screen.getByLabelText(locationSwitchLabel).props.value).toBe(false);
  });
});

// 무비 완성 알림 받기
const movieSwitchLabel = '\uBB34\uBE44 \uC644\uC131 \uC54C\uB9BC \uBC1B\uAE30';
// 설정에서 권한 켜기
const settingsRowLabel = '\uC124\uC815\uC5D0\uC11C \uAD8C\uD55C \uCF1C\uAE30';

describe('MeNotificationsPage movie-ready alerts', () => {
  it('a refused grant leaves the switch off and surfaces the settings row', async () => {
    mockLocalNotificationPermission.mockResolvedValue(false);
    await renderPage();

    await fireEvent(screen.getByLabelText(movieSwitchLabel), 'valueChange', true);

    await waitFor(() => expect(screen.getByLabelText(settingsRowLabel)).toBeTruthy());
    expect(screen.getByLabelText(movieSwitchLabel).props.value).toBe(false);
  });
});
