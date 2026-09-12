import { useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useIsAuthenticated } from '@/entities/session';
import {
  getOpeningLocalNotificationResponse,
  getOpeningNotification,
  onLocalNotificationResponse,
  onNotificationOpened,
} from '@/shared/lib/notifications';

import { notificationTarget } from './notification-target';

/**
 * Two deliveries of one tap arrive within this window: a push the OS displayed
 * can be reported by both the FCM listener and the local-notification one, and
 * the tap that launched the app is answered by the "opening" query and, on some
 * platforms, the live listener too.
 */
const SameTapWindowMs = 2_000;

/**
 * Takes the user where a tapped notification points.
 *
 * A notification's purpose is its destination: a 만료 예고 that opens the app on
 * whatever tab it was left on has not told the user anything they can act on
 * (SNAP-13), and a 완성 알림 is a shortcut to the movie or it is noise. Before
 * this existed every tap only opened the app.
 *
 * It listens on both channels a tap can come through — the FCM adapter for a
 * push the OS displayed, the local adapter for a notice the app presented
 * itself (a failed run, or a push re-presented while foregrounded) — and asks
 * each once for the tap that launched the app from a quit state. Which kinds go
 * where is `notificationTarget`'s to say; this component only knows *when* it
 * may go: not before the root navigator exists, and not while signed out, since
 * every destination sits behind the authenticated guard. A tap that arrives
 * early waits for both and is honoured the moment they are true.
 *
 * Startup work rather than a feature, like the other headless nodes here: it
 * spans two features' destinations, and features must not import each other.
 */
export function NotificationTapRouter(): null {
  const router = useRouter();
  const navigatorReady = useRootNavigationState()?.key !== undefined;
  const isAuthenticated = useIsAuthenticated();
  const ready = navigatorReady && isAuthenticated;

  const pending = useRef<Href | null>(null);
  const seen = useRef(new Set<string>());
  const lastOpened = useRef<{ key: string; at: number } | null>(null);
  // Read at call time by listeners that were subscribed once.
  const latest = useRef({ ready, router });
  useEffect(() => {
    latest.current = { ready, router };
  });

  useEffect(() => {
    if (!ready || !pending.current) return;
    const href = pending.current;
    pending.current = null;
    router.navigate(href);
  }, [ready, router]);

  useEffect(() => {
    const open = (source: string, id: string | undefined, data: unknown) => {
      const href = notificationTarget(data);
      if (!href) return;
      if (id !== undefined) {
        const seenKey = `${source}:${id}`;
        if (seen.current.has(seenKey)) return;
        seen.current.add(seenKey);
      }
      const key = JSON.stringify(href);
      const now = Date.now();
      if (lastOpened.current?.key === key && now - lastOpened.current.at < SameTapWindowMs) return;
      lastOpened.current = { key, at: now };

      if (!latest.current.ready) {
        pending.current = href;
        return;
      }
      latest.current.router.navigate(href);
    };

    void getOpeningNotification().then((message) => {
      if (message) open('push', message.messageId, message.data);
    });
    void getOpeningLocalNotificationResponse().then((response) => {
      if (response) open('local', response.id, response.data);
    });
    const unsubscribers = [
      onNotificationOpened((message) => open('push', message.messageId, message.data)),
      onLocalNotificationResponse((response) => open('local', response.id, response.data)),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return null;
}
