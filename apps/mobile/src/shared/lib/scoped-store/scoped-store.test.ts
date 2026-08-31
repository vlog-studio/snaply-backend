import { createScopedPersistence, type StoreScope } from './scoped-store';

/**
 * In-memory stand-in for the document-directory JSON files. A shared `files`
 * map keyed by store name is what the adoption and isolation cases assert
 * against, so each test seeds and reads it directly.
 */
jest.mock('@/shared/lib/local-store', () => {
  const files = new Map<string, string>();
  return {
    localStore: {
      getItem: jest.fn(async (key: string) => files.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        files.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        files.delete(key);
      }),
    },
    __files: files,
  };
});

const { __files: files } = jest.requireMock('@/shared/lib/local-store') as {
  __files: Map<string, string>;
};

const StoreName = 'snaply.things';

type ThingState = { things: string[]; hasHydrated: boolean };

/**
 * The persisted-store surface scoping touches, with every call recorded in one
 * list: the order of `setOptions` against `setState` is the guarantee that a
 * cleared store never writes over the account that is on the way out.
 */
function makeStore() {
  const calls: string[] = [];
  return {
    calls,
    setState: jest.fn((partial: Partial<ThingState>) => {
      calls.push(`setState:${JSON.stringify(partial.things)}`);
    }),
    persist: {
      setOptions: jest.fn(({ name }: { name: string }) => {
        calls.push(`setOptions:${name}`);
      }),
      rehydrate: jest.fn(async () => {
        calls.push('rehydrate');
      }),
    },
  };
}

function scopeThings(store: ReturnType<typeof makeStore>): (scope: StoreScope) => Promise<void> {
  return createScopedPersistence<ThingState>(store, StoreName, () => ({
    things: [],
    hasHydrated: false,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
});

describe('createScopedPersistence', () => {
  it("reads an account back from that account's own file", async () => {
    const store = makeStore();

    await scopeThings(store)('user-a');

    expect(store.persist.setOptions).toHaveBeenLastCalledWith({ name: `${StoreName}.user-a` });
    expect(store.persist.rehydrate).toHaveBeenCalledTimes(1);
  });

  it('clears against the signed-out file, so no account file is written over', async () => {
    const store = makeStore();
    const applyScope = scopeThings(store);

    await applyScope('user-a');
    store.calls.length = 0;
    await applyScope('user-b');

    // Clearing persists; it must land on the file nobody owns, and only then
    // may the incoming account's file be bound and read.
    expect(store.calls).toEqual([
      `setOptions:${StoreName}.signed-out`,
      'setState:[]',
      `setOptions:${StoreName}.user-b`,
      'rehydrate',
    ]);
  });

  it('empties the store without reading anything when nobody is signed in', async () => {
    const store = makeStore();
    const applyScope = scopeThings(store);

    await applyScope('user-a');
    store.persist.rehydrate.mockClear();
    await applyScope(null);

    expect(store.persist.setOptions).toHaveBeenLastCalledWith({
      name: `${StoreName}.signed-out`,
    });
    expect(store.setState).toHaveBeenLastCalledWith({ things: [], hasHydrated: false });
    expect(store.persist.rehydrate).not.toHaveBeenCalled();
  });

  it('does not read again when the same account is applied twice', async () => {
    const store = makeStore();
    const applyScope = scopeThings(store);

    await applyScope('user-a');
    await applyScope('user-a');

    expect(store.persist.rehydrate).toHaveBeenCalledTimes(1);
  });

  it('gives the file an account-blind build left behind to the first account', async () => {
    files.set(StoreName, '{"state":{"things":["from-older-build"]}}');
    const store = makeStore();
    const applyScope = scopeThings(store);

    await applyScope('user-a');

    expect(files.get(`${StoreName}.user-a`)).toBe('{"state":{"things":["from-older-build"]}}');
    expect(files.has(StoreName)).toBe(false);

    // And the next account starts empty rather than inheriting it in turn.
    await applyScope('user-b');
    expect(files.has(`${StoreName}.user-b`)).toBe(false);
  });

  it("keeps an account's own file when an unscoped one is still around", async () => {
    files.set(StoreName, '{"state":{"things":["from-older-build"]}}');
    files.set(`${StoreName}.user-a`, '{"state":{"things":["mine"]}}');
    const store = makeStore();

    await scopeThings(store)('user-a');

    expect(files.get(`${StoreName}.user-a`)).toBe('{"state":{"things":["mine"]}}');
    expect(files.has(StoreName)).toBe(false);
  });
});
