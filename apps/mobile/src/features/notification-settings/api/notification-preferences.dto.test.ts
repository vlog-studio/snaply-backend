import {
  mapNotificationPreferences,
  notificationPreferencesDtoSchema,
  toPreferencesPatch,
} from './notification-preferences.dto';

describe('notification preferences on the wire', () => {
  it('reads the notification fields out of the whole profile', () => {
    const dto = notificationPreferencesDtoSchema.parse({
      id: '7d1f1c1e-0000-4000-8000-000000000000',
      nickname: null,
      avatarUrl: null,
      interests: [],
      notificationEnabled: true,
      locationNotificationEnabled: false,
      movieNotificationEnabled: true,
      quietStart: 23,
      quietEnd: 7,
    });

    expect(mapNotificationPreferences(dto)).toEqual({
      locationAlerts: false,
      movieReady: true,
      quietStart: 23,
      quietEnd: 7,
    });
  });

  it.each([
    [{ movieReady: true }, { movieNotificationEnabled: true }],
    [{ locationAlerts: false }, { locationNotificationEnabled: false }],
    [
      { quietStart: 0, quietEnd: 6 },
      { quietStart: 0, quietEnd: 6 },
    ],
  ])('sends only the fields that changed — %j', (change, body) => {
    // Never the master switch: the app has no control for it.
    expect(toPreferencesPatch(change)).toEqual(body);
  });
});
