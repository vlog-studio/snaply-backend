import type { Snap, SnapSyncEntry } from '@/entities/snap';

import { MaxAutoUploadAttempts, pickNextUpload } from './pick-next-upload';

function makeSnap(id: string, capturedAt: number): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  };
}

const NoBlocked: ReadonlySet<string> = new Set();

describe('pickNextUpload', () => {
  it('picks the oldest snap that has no sync entry', () => {
    const snaps = [makeSnap('newer', 200), makeSnap('older', 100)];
    expect(pickNextUpload(snaps, {}, NoBlocked)?.id).toBe('older');
  });

  it.each<[string, SnapSyncEntry]>([
    ['uploading', { status: 'uploading' }],
    ['uploaded', { status: 'uploaded', videoId: 'video-1' }],
    ['exhausted failed', { status: 'failed', attempts: MaxAutoUploadAttempts }],
  ])('skips a snap whose entry is %s', (_label, entry) => {
    const snaps = [makeSnap('snap-1', 100)];
    expect(pickNextUpload(snaps, { 'snap-1': entry }, NoBlocked)).toBeUndefined();
  });

  it('requeues a failed snap that still has attempts left', () => {
    const snaps = [makeSnap('snap-1', 100)];
    const entries: Record<string, SnapSyncEntry> = {
      'snap-1': { status: 'failed', attempts: 1 },
    };
    expect(pickNextUpload(snaps, entries, NoBlocked)?.id).toBe('snap-1');
  });

  it('skips a snap the in-memory backoff is holding back', () => {
    const snaps = [makeSnap('blocked', 100), makeSnap('free', 200)];
    const entries: Record<string, SnapSyncEntry> = {
      blocked: { status: 'failed', attempts: 1 },
    };
    expect(pickNextUpload(snaps, entries, new Set(['blocked']))?.id).toBe('free');
  });

  it('returns undefined when everything is settled', () => {
    expect(pickNextUpload([], {}, NoBlocked)).toBeUndefined();
  });
});
