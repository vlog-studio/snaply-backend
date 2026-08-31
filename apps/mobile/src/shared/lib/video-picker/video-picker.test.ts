import * as ImagePicker from 'expo-image-picker';

import { pickVideoFromLibrary } from './video-picker';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const mockLaunchImageLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;

describe('pickVideoFromLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the system picker for one unedited video and converts milliseconds to seconds', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/picked.mp4',
          width: 1920,
          height: 1080,
          type: 'video',
          duration: 12_500,
        },
      ],
    });

    await expect(pickVideoFromLibrary()).resolves.toEqual({
      uri: 'file:///cache/picked.mp4',
      durationSec: 12.5,
    });
    expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
  });

  it.each([
    ['the picker was cancelled', { canceled: true, assets: null }],
    ['the picker returned no asset', { canceled: false, assets: [] }],
  ])('returns no source when %s', async (_case, result) => {
    mockLaunchImageLibrary.mockResolvedValue(result as ImagePicker.ImagePickerResult);

    await expect(pickVideoFromLibrary()).resolves.toBeUndefined();
  });

  it.each([null, 0, -1])('omits an unusable picker duration (%s)', async (duration) => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/picked.mp4',
          width: 1920,
          height: 1080,
          type: 'video',
          duration,
        },
      ],
    });

    await expect(pickVideoFromLibrary()).resolves.toEqual({
      uri: 'file:///cache/picked.mp4',
      durationSec: undefined,
    });
  });
});
