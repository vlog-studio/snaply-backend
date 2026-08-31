import { z } from 'zod';

import { openApiSocket, type ApiSocket } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/**
 * One thing the run reported.
 *
 * `done` is `progress: 100` rather than a status of its own — that is how the
 * server says it: the worker's last publish is a progress message carrying the
 * rendered file's URL, and the socket closes right after it.
 */
export type EditProgressEvent =
  | { kind: 'progress'; progress: number; step?: string }
  | { kind: 'done'; outputUrl?: string }
  | {
      kind: 'failed';
      /** The server's diagnostic — not user copy; the screen words from `code`. */
      error?: string;
      /** The failure's classification code, same values as `GET`'s `errorCode`. */
      code?: string;
    }
  /** The job was canceled — by this device or another session — and the run ended. */
  | { kind: 'canceled' };

export type EditProgressHandlers = {
  onEvent: (event: EditProgressEvent) => void;
  /** The socket ended, for any reason. The run itself may still be going. */
  onClose?: () => void;
};

// Terminal frames are checked first: they carry `status` and no `progress`,
// and reading one as a progress frame would drop the reason on the floor.
const failureFrame = z.object({
  status: z.literal('failed'),
  error: z.string().optional(),
  code: z.string().optional(),
});
// The server's last word on a canceled job, published as the cancel endpoint
// ends the run; the socket closes right after it.
const canceledFrame = z.object({ status: z.literal('canceled') });
const progressFrame = z.object({ progress: z.number(), step: z.string().optional() });
const doneFrame = progressFrame.extend({ outputUrl: z.string().optional() });

function toEvent(payload: unknown): EditProgressEvent | undefined {
  const failure = failureFrame.safeParse(payload);
  if (failure.success) {
    return { kind: 'failed', error: failure.data.error, code: failure.data.code };
  }
  if (canceledFrame.safeParse(payload).success) return { kind: 'canceled' };

  const progress = doneFrame.safeParse(payload);
  if (!progress.success) return undefined;
  if (progress.data.progress >= 100) {
    return { kind: 'done', outputUrl: progress.data.outputUrl };
  }
  return {
    kind: 'progress',
    progress: Math.max(0, Math.round(progress.data.progress)),
    step: progress.data.step,
  };
}

/**
 * What the pipeline publishes, at the milestones it publishes them, so mock mode
 * has something to show. Taken from the worker's own progress calls rather than
 * invented — the timings are a guess at a run's pace, the labels and percentages
 * are not.
 *
 * It deliberately ends **without** an `outputUrl`: mock mode composites nothing,
 * and a made-up URL would make the movie screen try to play a file that does not
 * exist. A movie that finishes here has no render file and plays its cuts, which
 * is what the app did before any of this existed.
 */
const MockMilestones: readonly { afterMs: number; progress: number; step: string }[] = [
  { afterMs: 300, progress: 0, step: '시작' },
  { afterMs: 3_000, progress: 10, step: '원본 다운로드 완료' },
  { afterMs: 9_000, progress: 35, step: '컷편집 완료' },
  { afterMs: 8_000, progress: 60, step: '음악 매칭 중...' },
  { afterMs: 8_000, progress: 85, step: '자막 생성 중...' },
  { afterMs: 6_000, progress: 95, step: '업로드 중...' },
  { afterMs: 3_000, progress: 100, step: '완료' },
];

function subscribeMock(handlers: EditProgressHandlers): ApiSocket {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let closed = false;
  let elapsed = 0;

  for (const milestone of MockMilestones) {
    elapsed += milestone.afterMs;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (closed) return;
      handlers.onEvent(
        milestone.progress >= 100
          ? { kind: 'done' }
          : { kind: 'progress', progress: milestone.progress, step: milestone.step },
      );
      if (milestone.progress >= 100) {
        closed = true;
        handlers.onClose?.();
      }
    }, elapsed);
    timers.add(timer);
  }

  return {
    close: () => {
      if (closed) return;
      closed = true;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    },
  };
}

/**
 * Follow a run as it happens (`WebSocket /edit-jobs/{id}/progress`).
 *
 * **Not an OpenAPI endpoint** — the backend hides the route from its own spec
 * because a socket cannot be expressed there, so nothing about these frames is
 * checked by generated types and every one is validated here. A frame that
 * matches nothing is dropped rather than guessed at.
 *
 * The socket is the live channel, not the authoritative one: it closes as soon
 * as the run ends, and a reconnect to a finished job is answered with a bare
 * `progress: 100` — no file URL. Treat `done` as "ask the REST endpoints what it
 * produced", which is what `useGenerationRunner` does.
 *
 * Routes to a timed replay of the pipeline's own milestones until an API origin
 * is configured.
 */
export function subscribeEditProgress(jobId: string, handlers: EditProgressHandlers): ApiSocket {
  if (USE_MOCK_API) return subscribeMock(handlers);

  return openApiSocket(`/edit-jobs/${encodeURIComponent(jobId)}/progress`, {
    onMessage: (payload) => {
      const event = toEvent(payload);
      if (event) handlers.onEvent(event);
      else if (__DEV__) console.warn('[compose-movie] unrecognized progress frame', payload);
    },
    onClose: handlers.onClose,
  });
}
