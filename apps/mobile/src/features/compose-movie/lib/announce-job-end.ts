import { ensureNotificationChannel, presentLocalNotification } from '@/shared/lib/notifications';

/** How a job ended, which is the whole of what the announcement has to say. */
export type JobOutcome = 'ready' | 'failed';

const Copy: Record<JobOutcome, { title: string; fallbackBody: string }> = {
  ready: { title: '무비가 완성됐어요', fallbackBody: '스튜디오에서 바로 볼 수 있어요.' },
  failed: { title: '무비를 만들지 못했어요', fallbackBody: '무비 탭에서 다시 시도할 수 있어요.' },
};

/**
 * Tell the user a generation job ended while they were doing something else.
 *
 * This is a *local* notification, not a push, because the job is local: nothing
 * remote is generating the movie, so nothing remote can announce it. When
 * `POST /movies` exists the server sends an FCM message instead and this call
 * goes away — the user-facing result is the same notification, which is why the
 * copy lives here rather than at the transport.
 *
 * Fire-and-forget by design: the caller is a timer carrying jobs forward and must
 * not wait on, or be broken by, a notification. Nothing is presented when the
 * grant is missing, and that is not an error worth surfacing — the announcement
 * is the wait's courtesy, not its result.
 */
export function announceJobEnd(
  outcome: JobOutcome,
  movie: { id: string; title: string },
  detail?: string,
): void {
  const { title, fallbackBody } = Copy[outcome];

  void (async () => {
    try {
      // Android drops a notification with no channel. The push registrar creates
      // the same one, but only after FCM registration succeeds — which it does
      // not in Expo Go — so this path cannot rely on it having run.
      await ensureNotificationChannel();
      await presentLocalNotification({
        title,
        body: `${movie.title} · ${detail ?? fallbackBody}`,
        // Carried for a notification-tap handler to route on. Nothing subscribes
        // to responses yet, so tapping only opens the app.
        data: { movieId: movie.id, outcome },
      });
    } catch (error) {
      if (__DEV__) console.warn('[movie] could not announce job end:', String(error));
    }
  })();
}
