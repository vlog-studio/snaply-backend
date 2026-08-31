import { useEffect } from 'react';

import { useIsAuthenticated } from '@/entities/session';
import {
  configureForegroundNotifications,
  ensureNotificationChannel,
  getFcmToken,
  hasNotificationPermission,
  onFcmTokenRefresh,
  onForegroundMessage,
  presentLocalNotification,
  registerForRemoteMessages,
} from '@/shared/lib/notifications';

import { registerFcmToken } from '../api/register-fcm-token';

/**
 * Acquire the device's FCM token and keep it registered with the backend.
 *
 * Runs only while authenticated, because `POST /auth/fcm-token` ties the token
 * to the current user. It only *checks* the notification grant — never prompts;
 * asking belongs to a control the user just touched (today, the 무비 완성 알림
 * switch), not to a background registrar at launch. Without the grant it does
 * nothing; `recheckKey` lets the app layer re-run the check when a grant may
 * have just landed. With the grant it registers with APNs (iOS), reads the
 * token, and registers it; it then re-registers on token refresh. Foreground
 * messages are presented as a local notification, since FCM suppresses the
 * system banner while the app is foregrounded.
 */
export function usePushTokenRegistration({ recheckKey }: { recheckKey?: unknown } = {}): void {
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const unsubscribers: (() => void)[] = [];

    void (async () => {
      try {
        const granted = await hasNotificationPermission();
        if (!granted || cancelled) return;

        // Present foreground messages ourselves; without this handler+channel a
        // notification arriving while the app is open is delivered silently.
        configureForegroundNotifications();
        await ensureNotificationChannel();
        if (cancelled) return;

        await registerForRemoteMessages();
        const token = await getFcmToken();
        if (cancelled) return;
        await registerFcmToken(token);

        unsubscribers.push(
          onFcmTokenRefresh((refreshed) => {
            void registerFcmToken(refreshed);
          }),
        );
        unsubscribers.push(
          onForegroundMessage((message) => {
            const notification = message.notification;
            if (!notification) return;
            void presentLocalNotification({
              title: notification.title,
              body: notification.body,
              data: message.data,
            });
          }),
        );
      } catch (error) {
        if (__DEV__) console.warn('[push] token registration failed:', String(error));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAuthenticated, recheckKey]);
}
