import { getAlbumPermission, requestAlbumPermission, saveVideoToAlbum } from './album';

const mockPlatform: { OS: string; Version: number | string } = { OS: 'android', Version: 34 };

// A getter: jest hoists the factory above everything, and it runs when `./album`
// is imported — before this file's own declarations have run.
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockAlbumCreate = jest.fn();
const mockAssetCreate = jest.fn();

jest.mock('expo-media-library', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  Album: { create: (...args: unknown[]) => mockAlbumCreate(...args) },
  Asset: { create: (...args: unknown[]) => mockAssetCreate(...args) },
}));

const Denied = { granted: false, canAskAgain: true, status: 'denied' };
const Granted = { granted: true, canAskAgain: true, status: 'granted' };
const Blocked = { granted: false, canAskAgain: false, status: 'denied' };

function onPlatform(os: 'android' | 'ios', version: number | string) {
  mockPlatform.OS = os;
  mockPlatform.Version = version;
}

describe('album permission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue(Denied);
    mockRequestPermissions.mockResolvedValue(Granted);
  });

  it.each([30, 34])(
    'asks nothing on Android API %i, where adding needs no permission',
    async (api) => {
      onPlatform('android', api);

      await expect(requestAlbumPermission()).resolves.toEqual({ granted: true, canAskAgain: true });
      await expect(getAlbumPermission()).resolves.toEqual({ granted: true, canAskAgain: true });
      expect(mockGetPermissions).not.toHaveBeenCalled();
      expect(mockRequestPermissions).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['Android API 29', 'android', 29],
    ['iOS', 'ios', '18.0'],
  ] as const)('asks for adding only, never for reading, on %s', async (_label, os, version) => {
    onPlatform(os, version);

    await expect(requestAlbumPermission()).resolves.toEqual({ granted: true, canAskAgain: true });
    // writeOnly, with no granular read permission requested.
    expect(mockRequestPermissions).toHaveBeenCalledWith(true, []);
  });

  it('does not raise the prompt again once the OS has stopped offering it', async () => {
    onPlatform('ios', '18.0');
    mockGetPermissions.mockResolvedValue(Blocked);

    await expect(requestAlbumPermission()).resolves.toEqual({ granted: false, canAskAgain: false });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('checks without prompting', async () => {
    onPlatform('ios', '18.0');

    await expect(getAlbumPermission()).resolves.toEqual({ granted: false, canAskAgain: true });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });
});

describe('saveVideoToAlbum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlbumCreate.mockResolvedValue({});
    mockAssetCreate.mockResolvedValue({});
  });

  it('files the video under the Snaply album on Android', async () => {
    onPlatform('android', 34);

    await saveVideoToAlbum('file:///data/recordings/snaply-1.mp4');

    expect(mockAlbumCreate).toHaveBeenCalledWith('Snaply', [
      'file:///data/recordings/snaply-1.mp4',
    ]);
    expect(mockAssetCreate).not.toHaveBeenCalled();
  });

  it('adds the video to the library without an album on iOS, which would need full access', async () => {
    onPlatform('ios', '18.0');

    await saveVideoToAlbum('file:///data/recordings/snaply-1.mov');

    expect(mockAssetCreate).toHaveBeenCalledWith('file:///data/recordings/snaply-1.mov');
    expect(mockAlbumCreate).not.toHaveBeenCalled();
  });

  it('rejects when the copy could not be made', async () => {
    onPlatform('android', 34);
    mockAlbumCreate.mockRejectedValue(new Error('insert returned null'));

    await expect(saveVideoToAlbum('file:///x.mp4')).rejects.toThrow('insert returned null');
  });
});
