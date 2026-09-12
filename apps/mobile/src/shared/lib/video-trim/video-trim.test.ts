import { requireOptionalNativeModule } from 'expo';

import { probeVideo, trimVideo } from './video-trim';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const mockRequireOptionalNativeModule = requireOptionalNativeModule as jest.MockedFunction<
  typeof requireOptionalNativeModule
>;
const mockNativeTrim = jest.fn();
const mockNativeProbe = jest.fn();

describe('video-trim', () => {
  beforeAll(() => {
    mockRequireOptionalNativeModule.mockReturnValue({
      trim: mockNativeTrim,
      probe: mockNativeProbe,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeTrim.mockResolvedValue({
      uri: 'file:///cache/video-trim/trim-1.mp4',
      width: 1920,
      height: 1080,
      durationMs: 3000,
    });
    mockNativeProbe.mockResolvedValue({ width: 720, height: 1280, durationMs: 1200 });
  });

  describe('trimVideo', () => {
    it('resolves the native module lazily and forwards the exact millisecond window', async () => {
      expect(mockRequireOptionalNativeModule).not.toHaveBeenCalled();

      await expect(
        trimVideo('file:///cache/source.mp4', { startMs: 42_500, endMs: 45_500 }),
      ).resolves.toMatchObject({ durationMs: 3000 });

      expect(mockRequireOptionalNativeModule).toHaveBeenCalledWith('VideoTrim');
      expect(mockNativeTrim).toHaveBeenCalledWith('file:///cache/source.mp4', 42_500, 45_500);

      await trimVideo('file:///cache/source.mp4', { startMs: 0, endMs: 500 });
      expect(mockRequireOptionalNativeModule).toHaveBeenCalledTimes(1);
    });
  });

  describe('probeVideo', () => {
    it('answers with the rotation-applied size and the length the native module read', async () => {
      await expect(probeVideo('file:///doc/recordings/snaply-1.mp4')).resolves.toEqual({
        width: 720,
        height: 1280,
        durationMs: 1200,
      });

      expect(mockNativeProbe).toHaveBeenCalledWith('file:///doc/recordings/snaply-1.mp4');
    });

    // A file the platform cannot open is an answer the caller has a fallback
    // for, not a failure that should take the capture down with it.
    it('answers without a measurement when the native module rejects', async () => {
      mockNativeProbe.mockRejectedValue(new Error('not a file uri'));

      await expect(probeVideo('content://gallery/1')).resolves.toBeUndefined();
    });
  });
});

// Expo Go links no `VideoTrim`; capture must keep working there, trimming not.
// The binding is cached per module instance, so this case gets a fresh one.
describe('video-trim without the native module', () => {
  let unlinked: typeof import('./video-trim');

  beforeAll(() => {
    mockRequireOptionalNativeModule.mockReturnValue(null);
    jest.isolateModules(() => {
      unlinked = jest.requireActual<typeof import('./video-trim')>('./video-trim');
    });
  });

  it('measures nothing', async () => {
    await expect(
      unlinked.probeVideo('file:///doc/recordings/snaply-1.mp4'),
    ).resolves.toBeUndefined();
  });

  it('refuses to trim', async () => {
    await expect(
      unlinked.trimVideo('file:///cache/source.mp4', { startMs: 0, endMs: 500 }),
    ).rejects.toThrow('VideoTrim');
  });
});
