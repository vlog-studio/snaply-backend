import { readVideoDuration } from '@/shared/lib/video-duration';
import { probeVideo } from '@/shared/lib/video-trim';

import { readVideoMetadata } from './video-metadata';

// Both readers are shared adapters of their own; this module only decides which
// answer to trust, so each is mocked at its Public API.
jest.mock('@/shared/lib/video-trim', () => ({ probeVideo: jest.fn() }));
jest.mock('@/shared/lib/video-duration', () => ({ readVideoDuration: jest.fn() }));

const mockProbeVideo = probeVideo as jest.MockedFunction<typeof probeVideo>;
const mockReadVideoDuration = readVideoDuration as jest.MockedFunction<typeof readVideoDuration>;

const uri = 'file:///doc/recordings/snaply-1.mp4';

describe('readVideoMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProbeVideo.mockResolvedValue(undefined);
    mockReadVideoDuration.mockResolvedValue(undefined);
  });

  it('takes the length and the rotation-applied size from the native probe', async () => {
    mockProbeVideo.mockResolvedValue({ width: 720, height: 1280, durationMs: 1234 });

    await expect(readVideoMetadata(uri)).resolves.toEqual({
      durationSec: 1.234,
      width: 720,
      height: 1280,
    });
    expect(mockReadVideoDuration).not.toHaveBeenCalled();
  });

  // Expo Go links no native probe: the length is still measured there, the size
  // is not — and an unknown size must not be reported as a measured one.
  it('falls back to the player for the length alone when there is no native probe', async () => {
    mockReadVideoDuration.mockResolvedValue(2.5);

    await expect(readVideoMetadata(uri)).resolves.toEqual({ durationSec: 2.5 });
    expect(mockReadVideoDuration).toHaveBeenCalledWith(uri);
  });

  it('asks the player for the length when the probe opened the file but read none', async () => {
    mockProbeVideo.mockResolvedValue({ width: 720, height: 1280, durationMs: 0 });
    mockReadVideoDuration.mockResolvedValue(3);

    await expect(readVideoMetadata(uri)).resolves.toEqual({
      durationSec: 3,
      width: 720,
      height: 1280,
    });
  });

  it.each([
    ['width', { width: 0, height: 1280 }],
    ['height', { width: 720, height: 0 }],
  ])('leaves the size out when the probe read no %s', async (_case, size) => {
    mockProbeVideo.mockResolvedValue({ ...size, durationMs: 1000 });

    await expect(readVideoMetadata(uri)).resolves.toEqual({ durationSec: 1 });
  });

  it('answers with nothing at all for a file no reader can open', async () => {
    await expect(readVideoMetadata(uri)).resolves.toEqual({});
  });
});
