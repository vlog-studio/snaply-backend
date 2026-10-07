import type { SnapSyncEntry } from '@/entities/snap';

import { restorableAfterDelete } from './restorable-after-delete';

const now = 1_760_000_000_000;

describe('restorableAfterDelete', () => {
  it.each<[string, SnapSyncEntry | undefined, ReturnType<typeof restorableAfterDelete>]>([
    [
      'an uploaded snap whose copy is still kept',
      { status: 'uploaded', videoId: 'v', expiresAt: now + 1 },
      { videoId: 'v', until: now + 1 },
    ],
    [
      'an uploaded snap whose expiry is not known yet',
      { status: 'uploaded', videoId: 'v' },
      { videoId: 'v' },
    ],
    ['a snap not uploaded yet', undefined, undefined],
    ['a snap whose upload failed', { status: 'failed', attempts: 2 }, undefined],
    ['a snap whose copy expired', { status: 'expired', videoId: 'v' }, undefined],
    [
      'a copy past its expiry the reconcile has not caught',
      { status: 'uploaded', videoId: 'v', expiresAt: now },
      undefined,
    ],
  ])('%s', (_label, entry, expected) => {
    expect(restorableAfterDelete(entry, now)).toEqual(expected);
  });
});
