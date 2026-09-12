import { ensureNotificationChannel, presentLocalNotification } from '@/shared/lib/notifications';

const Title = '무비를 만들지 못했어요';
const FallbackBody = '무비 탭에서 다시 시도할 수 있어요.';

/**
 * Tell the user a generation job **failed** while they were doing something else.
 *
 * Only the failure is announced from the device (2026-09-12). A finished run is
 * announced by the server's own `movie_ready` push — it knows the moment the
 * file lands and respects the user's quiet hours — and a local notice on top of
 * it rang twice for one movie. The server sends nothing for a failure, and the
 * user who walked away still has to hear that the wait is over, so that one
 * stays here.
 *
 * Fire-and-forget by design: the caller is a timer carrying jobs forward and must
 * not wait on, or be broken by, a notification. Nothing is presented when the
 * grant is missing, and that is not an error worth surfacing — the announcement
 * is the wait's courtesy, not its result.
 */
export function announceJobEnd(movie: { id: string; title: string }, detail?: string): void {
  void (async () => {
    try {
      // Android drops a notification with no channel. The push registrar creates
      // the same one, but only after FCM registration succeeds — which it does
      // not in Expo Go — so this path cannot rely on it having run.
      await ensureNotificationChannel();
      await presentLocalNotification({
        title: Title,
        body: `${movie.title} · ${detail ?? FallbackBody}`,
        // The same shape the server's pushes carry (`kind` + `movieId`), so the
        // app-layer tap router opens this movie whichever way the news arrived.
        data: { kind: 'movie_failed', movieId: movie.id },
      });
    } catch (error) {
      if (__DEV__) console.warn('[movie] could not announce job end:', String(error));
    }
  })();
}
