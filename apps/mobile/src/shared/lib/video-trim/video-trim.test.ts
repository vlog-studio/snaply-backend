import { requireNativeModule } from 'expo';

import { trimVideo } from './video-trim';

jest.mock('expo', () => ({ requireNativeModule: jest.fn() }));

const mockRequireNativeModule = requireNativeModule as jest.MockedFunction<
  typeof requireNativeModule
>;
const mockNativeTrim = jest.fn();

describe('trimVideo', () => {
  beforeAll(() => {
    mockRequireNativeModule.mockReturnValue({ trim: mockNativeTrim });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeTrim.mockResolvedValue({
      uri: 'file:///cache/video-trim/trim-1.mp4',
      width: 1920,
      height: 1080,
      durationMs: 3000,
    });
  });

  it('resolves the native module lazily and forwards the exact millisecond window', async () => {
    expect(mockRequireNativeModule).not.toHaveBeenCalled();

    await expect(
      trimVideo('file:///cache/source.mp4', { startMs: 42_500, endMs: 45_500 }),
    ).resolves.toMatchObject({ durationMs: 3000 });

    expect(mockRequireNativeModule).toHaveBeenCalledWith('VideoTrim');
    expect(mockNativeTrim).toHaveBeenCalledWith('file:///cache/source.mp4', 42_500, 45_500);

    await trimVideo('file:///cache/source.mp4', { startMs: 0, endMs: 500 });
    expect(mockRequireNativeModule).toHaveBeenCalledTimes(1);
  });
});
