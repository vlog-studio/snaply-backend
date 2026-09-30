import type { Snap } from '@/entities/snap';

import { useAlbumAutoSaveStore } from './album-auto-save-store';
import { saveCapturedSnapToAlbum } from './save-captured-snap';

const mockSaveSnapToAlbum = jest.fn();

jest.mock('./save-snap-to-album', () => ({
  saveSnapToAlbum: (snap: unknown, options: unknown) => mockSaveSnapToAlbum(snap, options),
}));

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const snap: Snap = {
  id: 'snaply-1.mp4',
  uri: 'file:///doc/recordings/snaply-1.mp4',
  durationSec: 3,
  capturedAt: 1_000,
  width: 720,
  height: 1280,
  orientation: 'portrait',
};

describe('saveCapturedSnapToAlbum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveSnapToAlbum.mockResolvedValue('saved');
  });

  it('does nothing while automatic saving is off', async () => {
    useAlbumAutoSaveStore.setState({ enabled: false });

    await expect(saveCapturedSnapToAlbum(snap)).resolves.toBeUndefined();

    expect(mockSaveSnapToAlbum).not.toHaveBeenCalled();
  });

  it('saves a copy without raising any permission prompt when it is on', async () => {
    useAlbumAutoSaveStore.setState({ enabled: true });
    mockSaveSnapToAlbum.mockResolvedValue('blocked');

    await expect(saveCapturedSnapToAlbum(snap)).resolves.toBe('blocked');

    expect(mockSaveSnapToAlbum).toHaveBeenCalledWith(snap, { ask: false });
  });

  it('waits for the stored choice to be read back before deciding', async () => {
    const persisted = useAlbumAutoSaveStore.persist;
    let finishHydration: () => void = () => {};
    const hasHydrated = jest.spyOn(persisted, 'hasHydrated').mockReturnValue(false);
    jest.spyOn(persisted, 'onFinishHydration').mockImplementation((listener) => {
      finishHydration = () => listener(useAlbumAutoSaveStore.getState());
      return () => {};
    });

    const decided = saveCapturedSnapToAlbum(snap);
    // The stored `true` lands after the capture asked.
    useAlbumAutoSaveStore.setState({ enabled: true });
    hasHydrated.mockReturnValue(true);
    finishHydration();

    await expect(decided).resolves.toBe('saved');
    jest.restoreAllMocks();
  });
});
