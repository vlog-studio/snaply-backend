import { ApiError } from '@/shared/api';

/**
 * How many snaps one edit draft takes, as the backend states it on its
 * `TOO_MANY_SNAPS` 400 (`error.max`). The transport carries the field blind
 * (`ApiError.details`); narrowing it is this slice's job, the same split as
 * `readCreditShortfall`.
 *
 * Returns `undefined` for anything else — a different error, or a cap that is
 * not a positive whole number. The cap shapes the picking and the refusal's
 * wording; the refusal stands without it.
 */
export function readDraftSnapLimit(error: unknown): number | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const max = error.details?.max;
  return typeof max === 'number' && Number.isInteger(max) && max > 0 ? max : undefined;
}
