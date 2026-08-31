import { localStore } from '@/shared/lib/local-store';

/** The device-level list of accounts whose local library is owed a cleanup. */
const LedgerKey = 'snaply.deleted-accounts';

/**
 * An account that was soft-deleted from this device, and when its local library
 * stops being worth keeping — the same deadline the backend reported for the
 * purge of the account itself.
 */
export type DeletedAccount = {
  userId: string;
  /** Epoch ms; the account is restorable until then. */
  purgeAfter: number;
};

/**
 * The ledger is deliberately *not* account-scoped. It is read while nobody is
 * signed in, on behalf of accounts that can no longer sign in — a per-account
 * file would be unreachable exactly when it is needed. It holds ids and dates
 * only, never anything the accounts captured.
 */
export async function readDeletedAccounts(): Promise<DeletedAccount[]> {
  const raw = await localStore.getItem(LedgerKey);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is DeletedAccount =>
        typeof (entry as DeletedAccount | null)?.userId === 'string' &&
        Number.isFinite((entry as DeletedAccount | null)?.purgeAfter),
    );
  } catch {
    return [];
  }
}

/** Records a deletion, replacing any earlier entry for the same account. */
export async function rememberDeletedAccount(entry: DeletedAccount): Promise<void> {
  const kept = (await readDeletedAccounts()).filter(({ userId }) => userId !== entry.userId);
  await localStore.setItem(LedgerKey, JSON.stringify([...kept, entry]));
}

/** Called when the account comes back, and when its cleanup is done. */
export async function forgetDeletedAccount(userId: string): Promise<void> {
  const entries = await readDeletedAccounts();
  const kept = entries.filter((entry) => entry.userId !== userId);
  if (kept.length === entries.length) return;
  if (kept.length === 0) await localStore.removeItem(LedgerKey);
  else await localStore.setItem(LedgerKey, JSON.stringify(kept));
}
