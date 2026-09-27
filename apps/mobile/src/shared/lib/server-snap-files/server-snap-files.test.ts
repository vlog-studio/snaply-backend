import * as FileSystem from 'expo-file-system';

import {
  deleteServerSnapFile,
  downloadServerSnapFile,
  isServerSnapFile,
  serverSnapFileUri,
} from './server-snap-files';

/**
 * In-memory stand-in for the expo-file-system OOP API: a set of URIs that
 * exist, and a `downloadFileAsync` whose outcome each test decides.
 */
jest.mock('expo-file-system', () => {
  const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');
  const files = new Set<string>();
  const download = jest.fn();

  class Directory {
    uri: string;
    constructor(base: { uri: string }, name: string) {
      this.uri = `${stripTrailingSlash(base.uri)}/${name}`;
    }
    create() {}
  }

  class File {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = typeof base === 'string' ? base : `${stripTrailingSlash(base.uri)}/${name ?? ''}`;
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return files.has(this.uri);
    }
    get parentDirectory() {
      return { uri: this.uri.replace(/\/[^/]+$/, '') };
    }
    delete() {
      files.delete(this.uri);
    }
    async move(target: { uri: string }) {
      files.delete(this.uri);
      files.add(target.uri);
    }
    static downloadFileAsync = download;
  }

  return {
    Directory,
    File,
    Paths: { cache: { uri: 'file:///cache' } },
    __files: files,
    __download: download,
  };
});

const { __files: files, __download: download } = FileSystem as unknown as {
  __files: Set<string>;
  __download: jest.Mock;
};

const VideoId = '8f14e45f-ceea-467a-9e1b-1c3a2b4d5e6f';

describe('server-snap-files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    files.clear();
    download.mockImplementation(async (_url: string, partial: { uri: string }) => {
      files.add(partial.uri);
      return new FileSystem.File(partial.uri);
    });
  });

  it('keeps server snaps apart from recordings, under their video id', () => {
    const uri = serverSnapFileUri(VideoId);

    expect(uri).toBe(`file:///cache/server-snaps/${VideoId}.mp4`);
    expect(isServerSnapFile(uri)).toBe(true);
    expect(isServerSnapFile('file:///document/recordings/snaply-1.mp4')).toBe(false);
  });

  it('only exposes a completed download under the final name', async () => {
    const uri = serverSnapFileUri(VideoId);

    await downloadServerSnapFile('https://s3.test/rendition.mp4', uri);

    expect(files.has(uri)).toBe(true);
    expect([...files].some((file) => file.endsWith('.part'))).toBe(false);
  });

  it('leaves no file behind when the download fails', async () => {
    download.mockRejectedValueOnce(new Error('network down'));
    const uri = serverSnapFileUri(VideoId);

    await expect(downloadServerSnapFile('https://s3.test/rendition.mp4', uri)).rejects.toThrow();

    expect(files.has(uri)).toBe(false);
  });

  it('does not download a snap it already holds', async () => {
    const uri = serverSnapFileUri(VideoId);
    files.add(uri);

    await downloadServerSnapFile('https://s3.test/rendition.mp4', uri);

    expect(download).not.toHaveBeenCalled();
  });

  it('refuses to delete a file outside its own cache', () => {
    const recording = 'file:///document/recordings/snaply-1.mp4';
    files.add(recording);

    expect(() => deleteServerSnapFile(recording)).toThrow();
    expect(files.has(recording)).toBe(true);
  });

  it('deletes its own copy', () => {
    const uri = serverSnapFileUri(VideoId);
    files.add(uri);

    deleteServerSnapFile(uri);

    expect(files.has(uri)).toBe(false);
  });
});
