import { localStore } from '@/shared/lib/local-store';

/**
 * Who a persisted store's data belongs to: an account id, or `null` for nobody
 * signed in.
 */
export type StoreScope = string | null;

/**
 * A persisted zustand store, seen through the two things scoping needs: the
 * ability to replace the in-memory state, and the persist API that decides
 * which file that state is read from and written to.
 */
type ScopedPersistStore<S> = {
  setState: (partial: Partial<S>) => void;
  persist: {
    setOptions: (options: { name: string }) => void;
    /** Synchronous only for a synchronous storage backend; ours is a file. */
    rehydrate: () => Promise<void> | void;
  };
};

/** The file the signed-out app writes to, so no write can reach an account's. */
const SignedOutScope = 'signed-out';

function scopedName(baseName: string, scope: StoreScope): string {
  return `${baseName}.${scope ?? SignedOutScope}`;
}

/**
 * Hands the file an earlier, account-blind build wrote to the first account
 * that binds a scope, and only if that account has no file of its own yet.
 *
 * Devices upgrading into scoped storage hold one library under the bare key,
 * captured before anything recorded whose it was. Dropping it would delete a
 * real library; giving it to the first account to sign in is the only reading
 * of "whose" that the data supports. Removing the bare key afterwards is what
 * makes the adoption happen once.
 */
async function adoptUnscopedFile(baseName: string, name: string): Promise<void> {
  const unscoped = await localStore.getItem(baseName);
  if (unscoped === null) return;
  if ((await localStore.getItem(name)) === null) await localStore.setItem(name, unscoped);
  await localStore.removeItem(baseName);
}

/**
 * Reads the persisted state of a scope no live store is bound to — the only way
 * to see a signed-out account's data, which is what cleaning up after a deleted
 * account needs. Returns the `state` object out of the persist envelope, or
 * `null` when the scope has no file (or an unreadable one).
 *
 * The caller narrows it: the store that wrote the file is the only module that
 * knows what shape it holds.
 */
export async function readScopedState(baseName: string, scope: string): Promise<unknown> {
  const raw = await localStore.getItem(scopedName(baseName, scope));
  if (raw === null) return null;
  try {
    return (JSON.parse(raw) as { state?: unknown }).state ?? null;
  } catch {
    return null;
  }
}

/** Drops a scope's file. For an account whose data is not coming back. */
export function deleteScopedState(baseName: string, scope: string): Promise<void> {
  return localStore.removeItem(scopedName(baseName, scope));
}

/**
 * Binds a persisted store to one account's file, so a device shared by several
 * accounts keeps a separate library per account instead of one pile that every
 * account sees.
 *
 * Returns the function that switches scope. It is the store's own — created
 * next to the store, exported through its slice — while *when* to call it is an
 * app-level decision, made once from `_app/providers` as the session user
 * changes.
 *
 * The order inside is the whole safety argument. Clearing the store is itself a
 * write — the middleware persists every state change — so it must land on a
 * file no account owns: not the one being left (persistence still points at it)
 * and not the one being entered (it is about to be read back). The signed-out
 * file is the one that is meant to hold nothing, so that is where every clear
 * goes; only then is the new owner's file bound and read.
 *
 * The empty state in between is never mistaken for an empty library, because
 * `hasHydrated` goes down with it and comes back with the read. Stores created
 * with `skipHydration` never load a scope nobody asked for; the first read of
 * any data is the one this function performs.
 */
export function createScopedPersistence<S>(
  store: ScopedPersistStore<S>,
  baseName: string,
  emptyState: () => Partial<S>,
): (scope: StoreScope) => Promise<void> {
  let bound: string | null = null;

  return async function applyScope(scope: StoreScope): Promise<void> {
    const name = scopedName(baseName, scope);
    if (name === bound) return;
    bound = name;

    store.persist.setOptions({ name: scopedName(baseName, null) });
    store.setState(emptyState());
    if (scope === null) return;

    await adoptUnscopedFile(baseName, name);
    // A faster account switch already claimed the store; that call owns the
    // read, and finishing this one would hydrate over it.
    if (bound !== name) return;
    store.persist.setOptions({ name });
    await store.persist.rehydrate();
  };
}
