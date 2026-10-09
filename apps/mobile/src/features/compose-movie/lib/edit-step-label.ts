/**
 * What the progress line says for the stage a run last reported, in the app's
 * own words (2026-09-24).
 *
 * The worker publishes its stage as a raw string (`apps/ai-worker/src/worker.py`'s
 * `_progress` calls — `"원본 다운로드 완료"`, `"음악 매칭 중..."`, …). Those are
 * pipeline log lines: past-tense milestones, internal words (원본 다운로드,
 * 업로드), and ASCII ellipses. The screen never shows them; it maps each to
 * what the run is doing *next*, since a milestone arrives when the previous
 * stage ends — "원본 다운로드 완료" is the moment cutting begins.
 *
 * A step this build has never heard of reads as the generic line rather than
 * leaking through, so the worker can rename or add stages without a release
 * putting raw text on screen.
 */
/** The step the worker reports as it goes back to the queue to try again. */
const RetryStep = '다시 시도';

const StepLabels: Record<string, string> = {
  시작: '준비하는 중',
  '원본 다운로드 완료': '컷 자르는 중',
  '컷편집 완료': '음악 고르는 중',
  '음악 매칭 중': '음악 고르는 중',
  '자막 생성 중': '자막 넣는 중',
  '자막 건너뜀': '마무리하는 중',
  '업로드 중': '마무리하는 중',
  완료: '다 됐어요',
  // The worker's own retry after a passing failure (specs/movie.md MOV-12): the
  // run starts over, so the line says so instead of naming a stage already passed.
  [RetryStep]: '다시 시도하는 중',
};

/** A reported step the table does not know. */
const UnknownStepLabel = '만드는 중';

/** Before the first milestone arrives, and for a job stored without one. */
const QueuedStepLabel = '순서를 기다리는 중';

/** Trailing `...`/`…` and surrounding space are how the worker decorates a step, not part of it. */
function normalizeStep(step: string): string {
  return step
    .trim()
    .replace(/(\.{2,}|…)+$/u, '')
    .trim();
}

/** The user-facing line for the stage a run last reported (`undefined` = none yet). */
export function editStepLabel(step: string | undefined): string {
  if (step === undefined) return QueuedStepLabel;
  const normalized = normalizeStep(step);
  if (normalized === '') return QueuedStepLabel;
  return StepLabels[normalized] ?? UnknownStepLabel;
}

/**
 * The step a progress report should leave on screen, or `undefined` to keep the
 * one already shown.
 *
 * A retried run starts over from 0 while the shown progress holds where it was
 * (it never goes back), so the early stages it reports again would walk the line
 * backwards — 음악 고르는 중 then 컷 자르는 중. A step reported below the shown
 * progress is therefore stale, except the retry itself, which is the news; it
 * stays until the run passes the point it had reached.
 */
export function reportedStep(
  step: string | undefined,
  progress: number,
  shownProgress: number,
): string | undefined {
  if (step === undefined) return undefined;
  if (normalizeStep(step) === RetryStep) return step;
  return progress >= shownProgress ? step : undefined;
}
