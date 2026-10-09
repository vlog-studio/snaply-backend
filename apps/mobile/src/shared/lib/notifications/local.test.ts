import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensureNotificationChannel, presentLocalNotification } from './local';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.MockedFunction<
  typeof Notifications.scheduleNotificationAsync
>;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;

// Every notification goes to one Android channel, the one the server's pushes
// name as well (backlog E-25). An immediate notification without a channel
// lands in the library's fallback channel instead.
describe('local notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedule.mockResolvedValue('notification-1');
  });

  it('presents on the app channel on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await presentLocalNotification({ title: 'Movie ready', body: 'Open Snaply', data: {} });

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { channelId: 'default' } }),
    );
  });

  it('presents immediately with no channel on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    await presentLocalNotification({ title: 'Movie ready', body: 'Open Snaply' });

    expect(mockSchedule).toHaveBeenCalledWith(expect.objectContaining({ trigger: null }));
  });

  it('creates that same channel on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await ensureNotificationChannel();

    expect(mockSetChannel).toHaveBeenCalledWith('default', expect.any(Object));
  });
});
