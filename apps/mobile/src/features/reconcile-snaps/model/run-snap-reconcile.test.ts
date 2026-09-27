import {
  applyServerSnapState,
  getDeleteTombstones,
  getSnaps,
  getSnapSyncEntries,
  mergeServerSnaps,
  removeSnaps,
  type Snap,
} from '@/entities/snap';

import { runSnapReconcile } from './run-snap-reconcile';

/**
 * One pass against the real snap and sync stores. Only the edges are faked:
 * the HTTP transport, the file system, and the thumbnail cache.
 */
const mockApiRequest = jest.fn();
const mockDeleteLocalRecording = jest.fn();
const mockDeleteServerSnapFile = jest.fn();
const mockPrimeVideoThumbnail = jest.fn();

jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false, API_BASE_URL: 'https://api.test' }));
jest.mock('@/shared/api', () => ({
  apiRequest: (path: string, options: unknown) => mockApiRequest(path, options),
  apiPath: (template: string, params: Record<string, string>) =>
    template.replace('{id}', params.id),
}));
jest.mock('@/shared/lib/recording-files', () => ({
  deleteLocalRecording: (uri: string) => mockDeleteLocalRecording(uri),
}));
jest.mock('@/shared/lib/server-snap-files', () => ({
  serverSnapFileUri: (videoId: string) => `file:///cache/server-snaps/${videoId}.mp4`,
  isServerSnapFile: (uri: string) => uri.startsWith('file:///cache/server-snaps/'),
  serverSnapFileExists: () => false,
  downloadServerSnapFile: jest.fn(),
  deleteServerSnapFile: (uri: string) => mockDeleteServerSnapFile(uri),
}));
jest.mock('@/shared/lib/video-thumbnails', () => ({
  primeVideoThumbnail: (uri: string, url: string) => mockPrimeVideoThumbnail(uri, url),
  deleteVideoThumbnail: jest.fn(),
}));

function listItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'ready',
    thumbnailUrl: `https://s3.test/${id}.jpg`,
    durationSeconds: 3,
    durationMs: 3200,
    capturedAt: '2026-09-20T03:00:00.000Z',
    width: 720,
    height: 1280,
    clientId: null,
    expiresAt: '2026-10-05T03:00:00.000Z',
    createdAt: '2026-09-20T03:00:05.000Z',
    ...overrides,
  };
}

/** Answers the list and the lookup the way the server would. */
function serverAnswers(
  items: ReturnType<typeof listItem>[],
  fates: { id: string; state: string; removalReason: string | null }[] = [],
) {
  mockApiRequest.mockImplementation(async (path: string) => {
    if (path === '/videos') return { items, nextCursor: null };
    if (path === '/videos/lookup') return { items: fates };
    throw new Error(`unexpected ${path}`);
  });
}

function ownSnap(id: string): Snap {
  return {
    id,
    uri: `file:///document/recordings/${id}`,
    durationSec: 3,
    durationMeasured: true,
    capturedAt: 1_000,
    width: 720,
    height: 1280,
    orientation: 'portrait',
    dimensionsMeasured: true,
  };
}

const notCancelled = () => false;

describe('runSnapReconcile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    removeSnaps(getSnaps().map((snap) => snap.id));
    applyServerSnapState({ entries: {}, dropped: Object.keys(getSnapSyncEntries()) });
    mockDeleteLocalRecording.mockResolvedValue(undefined);
    mockPrimeVideoThumbnail.mockResolvedValue(undefined);
  });

  it('brings in a snap shot on another device, uploaded and with its cover on the way', async () => {
    const videoId = '8f14e45f-ceea-467a-9e1b-1c3a2b4d5e6f';
    serverAnswers([listItem(videoId)]);

    await runSnapReconcile(notCancelled);

    expect(getSnaps()).toEqual([
      expect.objectContaining({ id: videoId, origin: 'server', durationSec: 3.2 }),
    ]);
    // Uploaded from the moment it appears, so the upload worker never takes it for a capture.
    expect(getSnapSyncEntries()[videoId]).toMatchObject({ status: 'uploaded', videoId });
    expect(mockPrimeVideoThumbnail).toHaveBeenCalledWith(
      `file:///cache/server-snaps/${videoId}.mp4`,
      `https://s3.test/${videoId}.jpg`,
    );
  });

  it('removes its own snap deleted on another device — file first, no DELETE owed', async () => {
    mergeServerSnaps([ownSnap('snaply-1.mp4')]);
    applyServerSnapState({
      entries: { 'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' } },
      dropped: [],
    });
    serverAnswers([], [{ id: 'v1', state: 'removed', removalReason: 'user' }]);

    await runSnapReconcile(notCancelled);

    expect(mockDeleteLocalRecording).toHaveBeenCalledWith(
      'file:///document/recordings/snaply-1.mp4',
    );
    expect(getSnaps()).toEqual([]);
    expect(getSnapSyncEntries()['snaply-1.mp4']).toBeUndefined();
    expect(getDeleteTombstones()).toEqual([]);
  });

  it('keeps a snap whose file refused to go, to be asked about again', async () => {
    mergeServerSnaps([ownSnap('snaply-1.mp4')]);
    applyServerSnapState({
      entries: { 'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' } },
      dropped: [],
    });
    serverAnswers([], [{ id: 'v1', state: 'removed', removalReason: 'user' }]);
    mockDeleteLocalRecording.mockRejectedValueOnce(new Error('busy'));

    await runSnapReconcile(notCancelled);

    expect(getSnaps().map((snap) => snap.id)).toEqual(['snaply-1.mp4']);
    expect(getSnapSyncEntries()['snaply-1.mp4']).toMatchObject({ status: 'uploaded' });
  });

  it('writes nothing when the lookup fails after the list arrived', async () => {
    mergeServerSnaps([ownSnap('snaply-1.mp4')]);
    applyServerSnapState({
      entries: { 'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' } },
      dropped: [],
    });
    mockApiRequest.mockImplementation(async (path: string) => {
      if (path === '/videos') return { items: [listItem('v-new')], nextCursor: null };
      throw new Error('network down');
    });

    await expect(runSnapReconcile(notCancelled)).rejects.toThrow('network down');

    expect(getSnaps().map((snap) => snap.id)).toEqual(['snaply-1.mp4']);
    expect(getSnapSyncEntries()).toEqual({ 'snaply-1.mp4': { status: 'uploaded', videoId: 'v1' } });
  });

  it('writes nothing when the pass is cancelled — the next account must not get this one', async () => {
    serverAnswers([listItem('v-new')]);
    let cancelled = false;
    mockApiRequest.mockImplementationOnce(async () => {
      cancelled = true;
      return { items: [listItem('v-new')], nextCursor: null };
    });

    await runSnapReconcile(() => cancelled);

    expect(getSnaps()).toEqual([]);
    expect(getSnapSyncEntries()).toEqual({});
  });

  it('reads the whole list, page by page', async () => {
    mockApiRequest.mockImplementation(
      async (path: string, options: { query?: { cursor?: string } }) => {
        if (path !== '/videos') return { items: [] };
        return options.query?.cursor
          ? { items: [listItem('v2')], nextCursor: null }
          : { items: [listItem('v1')], nextCursor: 'v1' };
      },
    );

    await runSnapReconcile(notCancelled);

    expect(
      getSnaps()
        .map((snap) => snap.id)
        .sort(),
    ).toEqual(['v1', 'v2']);
  });
});
