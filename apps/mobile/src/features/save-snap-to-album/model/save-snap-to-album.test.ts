import type { Snap } from '@/entities/snap';

import { saveSnapToAlbum } from './save-snap-to-album';

const mockGetPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockSaveVideo = jest.fn();
const mockFetchSnapFile = jest.fn();

// The native album and the snap's file are the edges.
jest.mock('@/shared/lib/media-library', () => ({
  getAlbumPermission: () => mockGetPermission(),
  requestAlbumPermission: () => mockRequestPermission(),
  saveVideoToAlbum: (uri: string) => mockSaveVideo(uri),
}));
jest.mock('@/entities/snap', () => ({
  fetchSnapFile: (snap: unknown) => mockFetchSnapFile(snap),
}));

const Granted = { granted: true, canAskAgain: true };
const Refused = { granted: false, canAskAgain: false };

function makeSnap(overrides: Partial<Snap> = {}): Snap {
  return {
    id: 'snaply-1.mp4',
    uri: 'file:///doc/recordings/snaply-1.mp4',
    durationSec: 3,
    capturedAt: 1_000,
    width: 720,
    height: 1280,
    orientation: 'portrait',
    ...overrides,
  };
}

describe('saveSnapToAlbum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermission.mockResolvedValue(Granted);
    mockRequestPermission.mockResolvedValue(Granted);
    mockSaveVideo.mockResolvedValue(undefined);
    mockFetchSnapFile.mockResolvedValue(undefined);
  });

  it('saves the snap file into the album, asking first when the user tapped', async () => {
    const snap = makeSnap();

    await expect(saveSnapToAlbum(snap, { ask: true })).resolves.toBe('saved');

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(mockSaveVideo).toHaveBeenCalledWith(snap.uri);
  });

  it('only checks the permission when nobody tapped anything', async () => {
    await saveSnapToAlbum(makeSnap(), { ask: false });

    expect(mockGetPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('makes no copy when the device does not allow adding to the album', async () => {
    mockRequestPermission.mockResolvedValue(Refused);

    await expect(saveSnapToAlbum(makeSnap(), { ask: true })).resolves.toBe('blocked');

    expect(mockFetchSnapFile).not.toHaveBeenCalled();
    expect(mockSaveVideo).not.toHaveBeenCalled();
  });

  it('brings the server copy of a snap that is not on this device before saving it', async () => {
    const snap = makeSnap({
      id: 'video-1',
      uri: 'file:///cache/server-snaps/video-1.mp4',
      origin: 'server',
    });
    const order: string[] = [];
    mockFetchSnapFile.mockImplementation(async () => {
      order.push('fetch');
    });
    mockSaveVideo.mockImplementation(async () => {
      order.push('save');
    });

    await expect(saveSnapToAlbum(snap, { ask: true })).resolves.toBe('saved');

    expect(mockFetchSnapFile).toHaveBeenCalledWith(snap);
    expect(order).toEqual(['fetch', 'save']);
  });

  it.each([
    [
      'the server copy cannot be fetched',
      () => mockFetchSnapFile.mockRejectedValue(new Error('offline')),
    ],
    [
      'the album refuses the copy',
      () => mockSaveVideo.mockRejectedValue(new Error('insert failed')),
    ],
    [
      'the permission cannot be read',
      () => mockRequestPermission.mockRejectedValue(new Error('no module')),
    ],
  ])('reports a failure, without throwing, when %s', async (_label, arrange) => {
    arrange();

    await expect(saveSnapToAlbum(makeSnap(), { ask: true })).resolves.toBe('failed');
  });
});
