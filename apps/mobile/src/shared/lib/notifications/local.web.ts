// Web has no native notification presentation in this app (FCM is native-only,
// and the foreground handler is never reached on web). These inert stubs mirror
// the native adapter's contract so shared consumers stay platform-agnostic.
export function configureForegroundNotifications(): void {}

export function ensureNotificationChannel(): Promise<void> {
  return Promise.resolve();
}

export function requestLocalNotificationPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

export function presentLocalNotification(_input: {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  return Promise.resolve('');
}
