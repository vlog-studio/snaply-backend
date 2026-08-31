import type { CreditBalance, CreditEntry } from '../model/credit';

/**
 * The in-memory ledger the mock mode serves — mutable so the flows that grant
 * or spend credits in mock mode (the rewarded-ad feature, today) read back as
 * a moving balance instead of a frozen number. Replaced wholesale by the real
 * `GET /billing/credits` once an API origin is configured; nothing here
 * persists across a reload, which is fine for a development seed.
 *
 * The seed tells a coherent story: a signup bonus, one export that failed and
 * was refunded, and one that stuck.
 */
const HOUR_MS = 60 * 60 * 1000;

let nextEntryId = 1;

function seedEntry(delta: number, reason: string, hoursAgo: number): CreditEntry {
  return {
    id: `mock-credit-${nextEntryId++}`,
    delta,
    reason,
    createdAt: new Date(Date.now() - hoursAgo * HOUR_MS),
  };
}

// Newest first, matching the wire contract.
const mockEntries: CreditEntry[] = [
  seedEntry(-100, 'export_reserve', 2),
  seedEntry(100, 'export_refund', 26),
  seedEntry(-100, 'export_reserve', 27),
  seedEntry(100, 'signup_bonus', 72),
];

/** A snapshot of the mock ledger, shaped exactly like the real response. */
export function readMockCreditBalance(): CreditBalance {
  return {
    balance: mockEntries.reduce((sum, entry) => sum + entry.delta, 0),
    entries: [...mockEntries],
  };
}

/**
 * Prepends a grant/spend to the mock ledger and returns the new balance.
 *
 * Mock-only seam: in production every write to the ledger happens server-side
 * (store webhook, SSV callback, edit-job transaction) and the app only ever
 * reads. Callers must guard with `USE_MOCK_API`; the real flows invalidate
 * `creditQueries` and refetch instead.
 */
export function grantMockCredits(delta: number, reason: string): number {
  mockEntries.unshift({
    id: `mock-credit-${nextEntryId++}`,
    delta,
    reason,
    createdAt: new Date(),
  });
  return mockEntries.reduce((sum, entry) => sum + entry.delta, 0);
}
