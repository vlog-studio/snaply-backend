import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Thin wrappers over expo-notifications for locally-presented notifications.
// Transport/native concerns only. FCM does not surface a system notification
// while the app is foregrounded, so the owning feature uses these to present one
// itself. A `.web.ts` sibling provides inert stubs for platform-agnostic callers.

const ANDROID_CHANNEL_ID = 'default';

/**
 * Set the foreground presentation behavior. Without this, a notification that
 * arrives while the app is open is delivered silently. Call once at startup; the
 * handler is global and setting it again simply replaces it.
 */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ensure the Android notification channel exists. Android requires a channel
 * before any notification is displayed; iOS ignores channels. Idempotent — safe
 * to call on every app start.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '기본 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Ensure this app may present a notification, asking once if it still can.
 *
 * Separate from the FCM permission request: that one goes through Firebase and
 * resolves false wherever the native module is absent, while a locally presented
 * notification needs nothing but the OS grant. Call it from a control the user
 * just touched — a background caller would raise the system prompt out of
 * nowhere. Returns whether presentation is now allowed.
 */
export async function requestLocalNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

type LocalNotification = {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

/**
 * Present a notification immediately (`trigger: null`). Used to surface a
 * foreground FCM message as a visible banner. Returns the notification id.
 */
export function presentLocalNotification({
  title,
  body,
  data,
}: LocalNotification): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: title ?? null, body: body ?? null, data: data ?? {} },
    trigger: null,
  });
}

/** A tap on a locally presented notification: which one, and what it carried. */
export type LocalNotificationResponse = {
  /** The notification's own id — the one `presentLocalNotification` returned. */
  id: string;
  data: Record<string, unknown>;
};

function toResponse(response: Notifications.NotificationResponse): LocalNotificationResponse {
  const { identifier, content } = response.notification.request;
  return { id: identifier, data: (content.data ?? {}) as Record<string, unknown> };
}

/**
 * Subscribe to the user tapping a notification this app presented. Fires for a
 * tap while the app is running or backgrounded; the tap that launched the app
 * from a quit state is answered by `getOpeningLocalNotificationResponse`.
 */
export function onLocalNotificationResponse(
  listener: (response: LocalNotificationResponse) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
    listener(toResponse(response)),
  );
  return () => subscription.remove();
}

/**
 * The last notification tap the platform recorded for this process — on a cold
 * start, the one that launched the app. `null` when there was none. It stays
 * answered for the life of the process, so a caller asking more than once has
 * to remember which ids it already acted on.
 */
export async function getOpeningLocalNotificationResponse(): Promise<LocalNotificationResponse | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? toResponse(response) : null;
}
