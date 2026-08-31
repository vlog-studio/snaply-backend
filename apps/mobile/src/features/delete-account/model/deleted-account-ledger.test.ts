import {
  forgetDeletedAccount,
  readDeletedAccounts,
  rememberDeletedAccount,
} from './deleted-account-ledger';

/** In-memory stand-in for the document-directory JSON files. */
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

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
});

describe('deleted-account ledger', () => {
  it('keeps one entry per account, carrying the latest deadline', async () => {
    await rememberDeletedAccount({ userId: 'user-a', purgeAfter: 1 });
    await rememberDeletedAccount({ userId: 'user-b', purgeAfter: 2 });
    // Deleted, restored, deleted again: the second deadline is the live one.
    await rememberDeletedAccount({ userId: 'user-a', purgeAfter: 3 });

    expect(await readDeletedAccounts()).toEqual([
      { userId: 'user-b', purgeAfter: 2 },
      { userId: 'user-a', purgeAfter: 3 },
    ]);
  });

  it('drops the entry of an account that came back', async () => {
    await rememberDeletedAccount({ userId: 'user-a', purgeAfter: 1 });
    await rememberDeletedAccount({ userId: 'user-b', purgeAfter: 2 });

    await forgetDeletedAccount('user-a');

    expect(await readDeletedAccounts()).toEqual([{ userId: 'user-b', purgeAfter: 2 }]);
  });

  it('reads an unwritable or corrupted ledger as empty rather than throwing', async () => {
    files.set('snaply.deleted-accounts', 'not json');

    expect(await readDeletedAccounts()).toEqual([]);
  });
});
