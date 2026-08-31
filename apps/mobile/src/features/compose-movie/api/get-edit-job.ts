import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/** Where a queued run stands, as the backend reports it. */
export type EditJobState = {
  status: 'queued' | 'processing' | 'done' | 'failed' | 'canceled';
  /** 0–100. The pipeline publishes it at six milestones, not continuously. */
  progress: number;
  /**
   * The **result** video's id — not one of the sources. The backend creates the
   * output row up front and hangs the job off it, so this is what
   * `getEditedVideo` is asked for once the job is done.
   */
  videoId: string;
  /**
   * The server's diagnostic for a `failed` run — **not user copy**, by the
   * backend's own contract. The user-facing reason is worded from `errorCode`.
   */
  errorMessage?: string;
  /**
   * The failure's classification code (`TIMEOUT` | `SOURCE_UNAVAILABLE` |
   * `QUEUE_FAILED` | `INTERNAL`), set only on `failed`. A plain string because
   * the list is append-only — a code this build has not heard of must still
   * arrive, and `editFailureMessage` reads an unknown one as `INTERNAL`.
   */
  errorCode?: string;
};

const editJobSchema = z.object({
  // Not narrowed to the five known values: a status this build has not heard of
  // must not fail the poll that is trying to find out whether a run finished.
  status: z.string(),
  progress: z.number(),
  videoId: z.string(),
  errorMessage: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
});

function mapEditJob(dto: z.infer<typeof editJobSchema>): EditJobState {
  const known = ['queued', 'processing', 'done', 'failed', 'canceled'] as const;
  const status = known.find((value) => value === dto.status) ?? 'processing';
  return {
    status,
    progress: Math.min(100, Math.max(0, Math.round(dto.progress))),
    videoId: dto.videoId,
    ...(dto.errorMessage ? { errorMessage: dto.errorMessage } : null),
    ...(dto.errorCode ? { errorCode: dto.errorCode } : null),
  };
}

async function getFromApi(jobId: string, signal?: AbortSignal): Promise<EditJobState> {
  const dto = await apiRequest(apiPath('/edit-jobs/{id}', { id: jobId }), {
    method: 'GET',
    schema: editJobSchema,
    signal,
  });
  return mapEditJob(dto);
}

function getMock(jobId: string): Promise<EditJobState> {
  return Promise.resolve({ status: 'done', progress: 100, videoId: `mock-result-${jobId}` });
}

/**
 * Ask where a run stands (`GET /edit-jobs/{id}`).
 *
 * The progress socket is the live channel; this is what makes the flow survive a
 * mobile app's life. A job that finishes while the app is backgrounded cannot be
 * learned about from the socket — reconnecting to a finished job gets
 * `{ progress: 100 }` and **no `outputUrl`**, because the server only attaches
 * the URL to the message the worker publishes as it completes. So the app asks
 * here on every return to the foreground, and this is also where a `failed` run
 * that ended unwitnessed comes from.
 *
 * An unknown status maps to `processing` — "keep waiting" is the answer that
 * cannot lose a result, where `failed` would throw one away and `done` would
 * claim a file that may not exist. `canceled` is known (2026-08-13): a job the
 * user stopped — from this device or during account deletion — must not read
 * as still running, or the movie would poll forever for a run that ended.
 */
export function getEditJob(jobId: string, signal?: AbortSignal): Promise<EditJobState> {
  return USE_MOCK_API ? getMock(jobId) : getFromApi(jobId, signal);
}
