/**
 * What a failed run tells the user, worded from the backend's classification
 * code rather than from its message (2026-08-13).
 *
 * The backend is explicit about the split: `errorMessage` is a diagnostic for
 * the server's own logs, and the app is expected to word the screen from
 * `errorCode` — `TIMEOUT | SOURCE_UNAVAILABLE | QUEUE_FAILED | INTERNAL`. The
 * code list is append-only, so a code this build has never heard of reads as
 * `INTERNAL` (the backend's own instruction), and a failure that carries no
 * code at all — a job stored by an older backend — gets the generic line.
 *
 * The table lives in this feature rather than on a screen because the reason is
 * *stored* (`failMovieJob`), and every surface that answers a failure — the
 * movie screen's footer, the studio board row, the movie-tab tile — reads the
 * stored string. Wording it at render time would need the same table in two
 * layers that may not import each other.
 */
const EditFailureMessages: Record<string, string> = {
  TIMEOUT: '시간이 오래 걸려 만들지 못했어요. 다시 시도해주세요.',
  SOURCE_UNAVAILABLE: '서버에서 스냅 원본을 찾지 못했어요. 다시 시도해주세요.',
  QUEUE_FAILED: '작업을 시작하지 못했어요. 다시 시도해주세요.',
  INTERNAL: '서버 문제로 만들지 못했어요. 다시 시도해주세요.',
};

/** A run that failed without saying why — no code, nothing to classify. */
const UnexplainedFailureMessage = '만들지 못했어요. 다시 시도해주세요.';

/** The user-facing reason for a failure classified as `code`. */
export function editFailureMessage(code: string | undefined): string {
  if (!code) return UnexplainedFailureMessage;
  return EditFailureMessages[code] ?? EditFailureMessages.INTERNAL;
}
