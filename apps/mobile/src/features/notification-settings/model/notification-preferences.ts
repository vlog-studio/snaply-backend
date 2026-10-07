/**
 * The account's notification preferences as the server holds them (NTF-7).
 *
 * Account-wide, not per device: they follow the user to a new device or a
 * reinstall. Whether *this* device may show what they allow — the OS
 * notification and location grants — is the device's, and is read separately.
 */
export type NotificationPreferences = {
  /** 위치 알림 — arrival pushes (`locationNotificationEnabled`). Off for a new account. */
  locationAlerts: boolean;
  /** 무비 완성 알림 — the completion push (`movieNotificationEnabled`). Off for a new account. */
  movieReady: boolean;
  /** Quiet hours, KST, as whole hours 0–23. Equal start and end means none. */
  quietStart: number;
  quietEnd: number;
};
