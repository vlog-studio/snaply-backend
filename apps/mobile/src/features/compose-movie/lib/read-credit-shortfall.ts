import { ApiError } from '@/shared/api';

/** What the 402 said the run costs and what the account holds. */
export type CreditShortfall = {
  required: number;
  balance: number;
};

/**
 * The numbers the backend attaches to its `INSUFFICIENT_CREDITS` 402
 * (`error.required` / `error.balance`). The transport carries those fields
 * blind (`ApiError.details`); narrowing them is this slice's job, the same
 * split as `delete-account`'s `readPurgeAfter`.
 *
 * Returns `undefined` for anything else — a different error, or a backend
 * that stopped sending the fields. The numbers are a read-out for the
 * refusal's wording, never a gate: the refusal stands without them.
 */
export function readCreditShortfall(error: unknown): CreditShortfall | undefined {
  if (!(error instanceof ApiError)) return undefined;

  const required = error.details?.required;
  const balance = error.details?.balance;
  if (typeof required !== 'number' || typeof balance !== 'number') return undefined;

  return { required, balance };
}
