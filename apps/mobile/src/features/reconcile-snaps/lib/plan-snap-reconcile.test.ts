import type { ServerSnap, ServerSnapFate, Snap, SnapSyncEntry } from '@/entities/snap';

import {
  liveVideoIds,
  planSnapReconcile,
  videoIdsToLookUp,
  type ReconcileLocal,
} from './plan-snap-reconcile';

const uriOf = (videoId: string) => `file:///cache/server-snaps/${videoId}.mp4`;

function ownSnap(id: string, capturedAt = 1_000): Snap {
  return {
    id,
    uri: `file:///document/recordings/${id}`,
    durationSec: 3,
    durationMeasured: true,
    capturedAt,
    width: 720,
    height: 1280,
    orientation: 'portrait',
    dimensionsMeasured: true,
  };
}

function snapFromElsewhere(videoId: string): Snap {
  return { ...ownSnap(videoId), uri: uriOf(videoId), origin: 'server' };
}

function serverSnap(videoId: string, overrides: Partial<ServerSnap> = {}): ServerSnap {
  return {
    videoId,
    ready: true,
    capturedAt: 5_000,
    durationSec: 3.2,
    durationMeasured: true,
    width: 720,
    height: 1280,
    thumbnailUrl: `https://s3.test/${videoId}.jpg`,
    expiresAt: 9_000_000,
    ...overrides,
  };
}

function local(
  snaps: Snap[],
  entries: Record<string, SnapSyncEntry> = {},
  tombstones: string[] = [],
): ReconcileLocal {
  return { snaps, entries, tombstones };
}

function remote(
  snaps: ServerSnap[],
  fates: [string, ServerSnapFate][] = [],
  asked: string[] = fates.map(([id]) => id),
) {
  return { snaps, asked: new Set(asked), fates: new Map(fates) };
}

describe('planSnapReconcile — snaps coming in', () => {
  it('brings in a snap shot elsewhere under its server id, already uploaded', () => {
    const plan = planSnapReconcile(local([]), remote([serverSnap('v1')]), uriOf);

    expect(plan.merge).toEqual([
      expect.objectContaining({
        id: 'v1',
        uri: uriOf('v1'),
        origin: 'server',
        durationSec: 3.2,
        durationMeasured: true,
        capturedAt: 5_000,
        width: 720,
        height: 1280,
        dimensionsMeasured: true,
        orientation: 'portrait',
      }),
    ]);
    expect(plan.entries.v1).toEqual({ status: 'uploaded', videoId: 'v1', expiresAt: 9_000_000 });
    expect(plan.thumbnails).toEqual([{ uri: uriOf('v1'), url: 'https://s3.test/v1.jpg' }]);
  });

  it('gives a snap the server never measured the stand-in size, unmarked', () => {
    const plan = planSnapReconcile(
      local([]),
      remote([serverSnap('v1', { width: undefined, height: undefined })]),
      uriOf,
    );

    expect(plan.merge[0]).toMatchObject({ width: 1080, height: 1920 });
    expect(plan.merge[0].dimensionsMeasured).toBeUndefined();
  });

  it('leaves out an upload that never finished', () => {
    const plan = planSnapReconcile(local([]), remote([serverSnap('v1', { ready: false })]), uriOf);

    expect(plan.merge).toEqual([]);
    expect(plan.entries).toEqual({});
  });

  it('does not bring back a snap deleted here whose DELETE is still owed', () => {
    const plan = planSnapReconcile(local([], {}, ['v1']), remote([serverSnap('v1')]), uriOf);

    expect(plan.merge).toEqual([]);
  });

  it('learns the expiry of this device own upload without touching the snap', () => {
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4')], { 'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' } }),
      remote([serverSnap('v1')]),
      uriOf,
    );

    expect(plan.merge).toEqual([]);
    expect(plan.entries['snaply-1.mp4']).toEqual({
      status: 'uploaded',
      videoId: 'v1',
      expiresAt: 9_000_000,
    });
  });

  it('recognises its own snap by the name it registered, when the upload record was lost', () => {
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4', 5_000)], {
        'snaply-1.mp4': { status: 'failed', attempts: 2 },
      }),
      remote([serverSnap('v1', { clientId: 'snaply-1.mp4', capturedAt: 5_000 })]),
      uriOf,
    );

    expect(plan.merge).toEqual([]);
    expect(plan.entries['snaply-1.mp4']).toMatchObject({ status: 'uploaded', videoId: 'v1' });
  });

  it('does not take another device snap of the same name for its own', () => {
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4', 5_000)]),
      remote([serverSnap('v1', { clientId: 'snaply-1.mp4', capturedAt: 900_000 })]),
      uriOf,
    );

    expect(plan.merge.map((snap) => snap.id)).toEqual(['v1']);
    expect(plan.entries['snaply-1.mp4']).toBeUndefined();
  });

  it('treats a second upload of its own snap as neither a new snap nor a new record', () => {
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4', 5_000)], {
        'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' },
      }),
      remote([serverSnap('v1'), serverSnap('v2', { clientId: 'snaply-1.mp4', capturedAt: 5_000 })]),
      uriOf,
    );

    expect(plan.merge).toEqual([]);
    expect(plan.entries['snaply-1.mp4']).toMatchObject({ videoId: 'v1' });
  });
});

describe('planSnapReconcile — snaps that left the server list', () => {
  const uploaded = (videoId: string): SnapSyncEntry => ({ status: 'uploaded', videoId });

  it.each<
    [string, Snap, ServerSnapFate | undefined, Partial<ReturnType<typeof planSnapReconcile>>]
  >([
    [
      'own snap deleted on another device: removed, file and all',
      ownSnap('snaply-1.mp4'),
      { state: 'removed', reason: 'user' },
      {
        removed: [{ snapId: 'snaply-1.mp4', uri: 'file:///document/recordings/snaply-1.mp4' }],
        dropped: ['snaply-1.mp4'],
      },
    ],
    [
      'own snap expired: kept, marked expired',
      ownSnap('snaply-1.mp4'),
      { state: 'removed', reason: 'expired' },
      {
        entries: { 'snaply-1.mp4': { status: 'expired', videoId: 'v1' } },
        removed: [],
        evicted: [],
      },
    ],
    [
      'own snap the server has no row for: uploaded again',
      ownSnap('snaply-1.mp4'),
      undefined,
      { removed: [], dropped: ['snaply-1.mp4'] },
    ],
  ])('%s', (_label, snap, fate, expected) => {
    const plan = planSnapReconcile(
      local([snap], { [snap.id]: uploaded('v1') }),
      remote([], fate ? [['v1', fate]] : [], ['v1']),
      uriOf,
    );

    expect(plan).toMatchObject(expected);
  });

  it.each<[string, ServerSnapFate | undefined, Partial<ReturnType<typeof planSnapReconcile>>]>([
    [
      'deleted elsewhere: removed',
      { state: 'removed', reason: 'user' },
      { removed: [{ snapId: 'v1', uri: uriOf('v1') }], dropped: ['v1'] },
    ],
    [
      'expired: its copy evicted, the snap kept as expired',
      { state: 'removed', reason: 'expired' },
      {
        entries: { v1: { status: 'expired', videoId: 'v1' } },
        evicted: [uriOf('v1')],
        removed: [],
      },
    ],
    [
      'no row anywhere: removed',
      undefined,
      { removed: [{ snapId: 'v1', uri: uriOf('v1') }], dropped: ['v1'] },
    ],
  ])('snap from elsewhere %s', (_label, fate, expected) => {
    const plan = planSnapReconcile(
      local([snapFromElsewhere('v1')], { v1: uploaded('v1') }),
      remote([], fate ? [['v1', fate]] : [], ['v1']),
      uriOf,
    );

    expect(plan).toMatchObject(expected);
  });

  it('removes nothing for merely being absent from the list', () => {
    // Absent, but never asked about — e.g. uploaded while the list was being read.
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4'), snapFromElsewhere('v2')], {
        'snaply-1.mp4': uploaded('v1'),
        v2: uploaded('v2'),
      }),
      remote([], [], []),
      uriOf,
    );

    expect(plan.removed).toEqual([]);
    expect(plan.dropped).toEqual([]);
    expect(plan.entries).toEqual({});
  });

  it('keeps a snap the server says is still there', () => {
    const plan = planSnapReconcile(
      local([ownSnap('snaply-1.mp4')], { 'snaply-1.mp4': uploaded('v1') }),
      remote([], [['v1', { state: 'live' }]]),
      uriOf,
    );

    expect(plan.removed).toEqual([]);
    expect(plan.dropped).toEqual([]);
  });
});

describe('videoIdsToLookUp', () => {
  it('asks about uploaded snaps the list no longer has, and nothing else', () => {
    const entries: Record<string, SnapSyncEntry> = {
      live: { status: 'uploaded', videoId: 'v-live' },
      gone: { status: 'uploaded', videoId: 'v-gone' },
      expired: { status: 'expired', videoId: 'v-expired' },
      failed: { status: 'failed', attempts: 1 },
      orphan: { status: 'uploaded', videoId: 'v-orphan' },
    };
    const snaps = ['live', 'gone', 'expired', 'failed'].map((id) => ownSnap(id));

    const ids = videoIdsToLookUp(
      { snaps, entries },
      liveVideoIds([serverSnap('v-live'), serverSnap('v-pending', { ready: false })]),
    );

    // An expired snap is not asked about again, and an entry without its snap is not asked at all.
    expect(ids).toEqual(['v-gone']);
  });
});
