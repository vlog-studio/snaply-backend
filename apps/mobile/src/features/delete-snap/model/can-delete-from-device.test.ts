import type { SnapSyncEntry } from '@/entities/snap';

import { canDeleteFromDevice } from './can-delete-from-device';

const now = 1_760_000_000_000;
const own = { id: 'snaply-1.mp4' };
const fromServer = { id: 'video-1', origin: 'server' as const };
const kept: SnapSyncEntry = { status: 'uploaded', videoId: 'v', expiresAt: now + 1 };

describe('canDeleteFromDevice', () => {
  it.each<[string, { id: string; origin?: 'server' }, SnapSyncEntry | undefined, boolean]>([
    ['an uploaded original whose copy is still kept', own, kept, true],
    [
      'an uploaded original whose expiry is not known yet',
      own,
      { status: 'uploaded', videoId: 'v' },
      true,
    ],
    ['an original not uploaded yet', own, undefined, false],
    ['an original whose upload failed', own, { status: 'failed', attempts: 2 }, false],
    ['an original whose copy expired', own, { status: 'expired', videoId: 'v' }, false],
    [
      'an original past its expiry the reconcile has not caught',
      own,
      { status: 'uploaded', videoId: 'v', expiresAt: now },
      false,
    ],
    ['a snap already playing from the server copy', fromServer, kept, false],
  ])('%s → %s', (_label, snap, entry, expected) => {
    expect(canDeleteFromDevice(snap, entry, now)).toBe(expected);
  });
});
