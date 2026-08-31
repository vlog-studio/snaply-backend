import { ApiError } from '@/shared/api';

/**
 * The purge deadline the backend attaches to its `ACCOUNT_PENDING_DELETION`
 * 403 (`error.purgeAfter`, ISO 8601). The transport carries that field blind,
 * so narrowing it is this slice's job — the account-deletion domain is what
 * knows the field exists and what it means.
 *
 * Returns `undefined` for anything else: a different error, a backend that
 * predates the field, or a value that is not a usable date. The date is a
 * read-out, never a gate — a caller must stay correct without it.
 */
export function readPurgeAfter(error: unknown): Date | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const raw = error.details?.purgeAfter;
  if (typeof raw !== 'string') return undefined;

  const purgeAfter = new Date(raw);
  return Number.isNaN(purgeAfter.getTime()) ? undefined : purgeAfter;
}
