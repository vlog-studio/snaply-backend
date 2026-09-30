import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { getVideoThumbnail, moveVideoThumbnail } from './video-thumbnails';

jest.mock('expo-file-system', () => {
  const files = new Set<string>();

  class Directory {
    readonly uri: string;

    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri.replace(/\/$/, '')}/${name}`;
    }

    create() {}
  }

  class File {
    readonly uri: string;

    constructor(parentOrUri: Directory | string, name?: string) {
      this.uri =
        typeof parentOrUri === 'string'
          ? parentOrUri
          : `${parentOrUri.uri.replace(/\/$/, '')}/${name ?? ''}`;
    }

    get exists() {
      return files.has(this.uri);
    }

    delete() {
      files.delete(this.uri);
    }

    async move(target: File) {
      files.delete(this.uri);
      files.add(target.uri);
    }
  }

  return {
    Directory,
    File,
    Paths: { cache: { uri: 'file:///cache' } },
    __files: files,
  };
});

jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn() }));

const files = (FileSystem as unknown as { __files: Set<string> }).__files;
const mockGetThumbnail = VideoThumbnails.getThumbnailAsync as jest.MockedFunction<
  typeof VideoThumbnails.getThumbnailAsync
>;

describe('getVideoThumbnail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    files.clear();
    mockGetThumbnail.mockImplementation(async (_uri, options) => ({
      uri: `file:///generated/frame-${options?.time}.jpg`,
      width: 320,
      height: 180,
    }));
  });

  it('forwards an explicit offset and caches each offset under a distinct file', async () => {
    const first = await getVideoThumbnail('file:///cache/source.mp4', { timeMs: 1200 });
    const cached = await getVideoThumbnail('file:///cache/source.mp4', { timeMs: 1200 });
    const second = await getVideoThumbnail('file:///cache/source.mp4', { timeMs: 2200 });

    expect(first).toContain('source@1200.jpg');
    expect(cached).toBe(first);
    expect(second).toContain('source@2200.jpg');
    expect(mockGetThumbnail).toHaveBeenCalledTimes(2);
    expect(mockGetThumbnail).toHaveBeenNthCalledWith(1, 'file:///cache/source.mp4', {
      time: 1200,
      quality: 0.6,
    });
    expect(mockGetThumbnail).toHaveBeenNthCalledWith(2, 'file:///cache/source.mp4', {
      time: 2200,
      quality: 0.6,
    });
  });

  it('uses the near-first-frame default without sharing its key with an explicit offset', async () => {
    const defaultFrame = await getVideoThumbnail('file:///cache/source.mp4');
    const explicitFrame = await getVideoThumbnail('file:///cache/source.mp4', { timeMs: 200 });

    expect(defaultFrame).toContain('/source.jpg');
    expect(explicitFrame).toContain('/source@200.jpg');
    expect(mockGetThumbnail).toHaveBeenCalledTimes(2);
  });

  it('returns no frame when native extraction fails', async () => {
    mockGetThumbnail.mockRejectedValue(new Error('unsupported codec'));

    await expect(
      getVideoThumbnail('file:///cache/source.mp4', { timeMs: 1200 }),
    ).resolves.toBeUndefined();
  });
});

describe('moveVideoThumbnail', () => {
  const recordingFrame = 'file:///cache/video-thumbnails/snaply-1.jpg';
  const serverCopyFrame = 'file:///cache/video-thumbnails/video-1.jpg';

  beforeEach(() => {
    jest.clearAllMocks();
    files.clear();
  });

  it('hands the cached cover to the path the video will live at', async () => {
    files.add(recordingFrame);

    await moveVideoThumbnail(
      'file:///documents/recordings/snaply-1.mp4',
      'file:///cache/server-snaps/video-1.mp4',
    );

    expect(files.has(recordingFrame)).toBe(false);
    expect(files.has(serverCopyFrame)).toBe(true);
    // The moved cover is what a lookup for the new path finds, without extracting.
    await expect(getVideoThumbnail('file:///cache/server-snaps/video-1.mp4')).resolves.toBe(
      serverCopyFrame,
    );
    expect(mockGetThumbnail).not.toHaveBeenCalled();
  });

  it('keeps a cover already cached for the new path and drops the old one', async () => {
    files.add(recordingFrame);
    files.add(serverCopyFrame);

    await moveVideoThumbnail(
      'file:///documents/recordings/snaply-1.mp4',
      'file:///cache/server-snaps/video-1.mp4',
    );

    expect(files.has(serverCopyFrame)).toBe(true);
    expect(files.has(recordingFrame)).toBe(false);
  });

  it('does nothing when there is no cover to hand over', async () => {
    await moveVideoThumbnail(
      'file:///documents/recordings/snaply-1.mp4',
      'file:///cache/server-snaps/video-1.mp4',
    );

    expect(files.size).toBe(0);
  });
});
