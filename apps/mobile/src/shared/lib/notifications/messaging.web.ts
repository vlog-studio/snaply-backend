// Web has no FCM. These inert stubs mirror the native adapter's contract so
// shared consumers can call them without platform branching; permission simply
// resolves false, which stops any downstream token work.
export function hasNotificationPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

export function registerForRemoteMessages(): Promise<void> {
  return Promise.resolve();
}

export function getFcmToken(): Promise<string> {
  return Promise.reject(new Error('FCM is not available on web'));
}

export function onFcmTokenRefresh(_listener: (token: string) => void): () => void {
  return () => {};
}

export function onForegroundMessage(_listener: (message: unknown) => void): () => void {
  return () => {};
}
