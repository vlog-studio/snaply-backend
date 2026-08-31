import { deleteLocalRecording } from '@/shared/lib/recording-files';

import { readDeletedAccounts, rememberDeletedAccount } from './deleted-account-ledger';
import { purgeExpiredLibraries, purgeLocalLibrary } from './purge-local-library';

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

jest.mock('@/shared/lib/recording-files', () => ({
  deleteLocalRecording: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/shared/lib/video-thumbnails', () => ({
  deleteVideoThumbnail: jest.fn(),
}));

const { __files: files } = jest.requireMock('@/shared/lib/local-store') as {
  __files: Map<string, string>;
};

const Deleted = 'user-deleted';
const Day = 24 * 60 * 60 * 1000;

function seedLibrary(userId: string, ...snapIds: string[]): void {
  files.set(
    `snaply.snaps.${userId}`,
    JSON.stringify({
      state: {
        snaps: snapIds.map((id) => ({ id, uri: `file:///doc/recordings/${id}.mp4` })),
      },
      version: 0,
    }),
  );
  files.set(`snaply.snap-sync.${userId}`, JSON.stringify({ state: { entries: {} }, version: 0 }));
  files.set(`snaply.movies.${userId}`, JSON.stringify({ state: { movies: [] }, version: 0 }));
}

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
});

describe('purgeLocalLibrary', () => {
  it('deletes the account recordings and all three of its store files', async () => {
    seedLibrary(Deleted, 'snap-1', 'snap-2');

    await purgeLocalLibrary(Deleted);

    expect(deleteLocalRecording).toHaveBeenCalledWith('file:///doc/recordings/snap-1.mp4');
    expect(deleteLocalRecording).toHaveBeenCalledWith('file:///doc/recordings/snap-2.mp4');
    expect([...files.keys()]).toEqual([]);
  });

  it('finishes the purge when a file is already gone', async () => {
    seedLibrary(Deleted, 'snap-1', 'snap-2');
    (deleteLocalRecording as jest.Mock).mockRejectedValueOnce(new Error('no such file'));

    await purgeLocalLibrary(Deleted);

    expect(deleteLocalRecording).toHaveBeenCalledTimes(2);
    expect(files.has(`snaply.snaps.${Deleted}`)).toBe(false);
  });

  it('touches no other account files', async () => {
    seedLibrary(Deleted, 'snap-1');
    seedLibrary('user-other', 'snap-other');

    await purgeLocalLibrary(Deleted);

    expect(deleteLocalRecording).not.toHaveBeenCalledWith('file:///doc/recordings/snap-other.mp4');
    expect(files.has('snaply.snaps.user-other')).toBe(true);
  });
});

describe('purgeExpiredLibraries', () => {
  const now = Date.parse('2026-09-11T00:00:00.000Z');

  it('keeps a deleted account library for as long as the account can be restored', async () => {
    seedLibrary(Deleted, 'snap-1');
    await rememberDeletedAccount({ userId: Deleted, purgeAfter: now + 10 * Day });

    const purged = await purgeExpiredLibraries({ now, signedInUserId: null });

    expect(purged).toEqual([]);
    expect(deleteLocalRecording).not.toHaveBeenCalled();
    expect(files.has(`snaply.snaps.${Deleted}`)).toBe(true);
  });

  it('collects the library once the grace period has run out', async () => {
    seedLibrary(Deleted, 'snap-1');
    await rememberDeletedAccount({ userId: Deleted, purgeAfter: now - 1 });

    const purged = await purgeExpiredLibraries({ now, signedInUserId: null });

    expect(purged).toEqual([Deleted]);
    expect(deleteLocalRecording).toHaveBeenCalledWith('file:///doc/recordings/snap-1.mp4');
    expect(files.has(`snaply.snaps.${Deleted}`)).toBe(false);
    // The entry goes with the files, so a later start does not sweep again.
    expect(await readDeletedAccounts()).toEqual([]);
  });

  it('never purges the signed-in account, which can still restore itself', async () => {
    seedLibrary(Deleted, 'snap-1');
    await rememberDeletedAccount({ userId: Deleted, purgeAfter: now - 1 });

    const purged = await purgeExpiredLibraries({ now, signedInUserId: Deleted });

    expect(purged).toEqual([]);
    expect(files.has(`snaply.snaps.${Deleted}`)).toBe(true);
  });
});
