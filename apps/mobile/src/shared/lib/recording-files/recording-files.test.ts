import { Directory, File } from 'expo-file-system';

import {
  deleteLocalRecording,
  listLocalRecordings,
  persistLocalRecording,
} from './recording-files';

/**
 * Minimal in-memory stand-in for the expo-file-system OOP API.
 * `File`/`Directory` are real classes so the module's `instanceof File`
 * video filter behaves as it does at runtime. File metadata is read from a
 * shared `registry` keyed by URI, which each test seeds before exercising
 * the module.
 */
jest.mock('expo-file-system', () => {
  const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');
  const join = (base: string, name: string) => `${stripTrailingSlash(base)}/${name}`;
  const nameOf = (uri: string) => stripTrailingSlash(uri).split('/').pop() ?? '';

  const registry = new Map<string, { size?: number; creationTime?: number; exists?: boolean }>();
  let listing: object[] = [];

  class Directory {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      const baseUri = typeof base === 'string' ? base : base.uri;
      this.uri = name === undefined ? stripTrailingSlash(baseUri) : join(baseUri, name);
    }
    create() {}
    list() {
      return listing;
    }
  }

  class File {
    uri: string;
    name: string;
    extension: string;
    size: number;
    creationTime?: number;
    lastModified?: number;
    exists: boolean;
    constructor(base: string | { uri: string }, name?: string) {
      const baseUri = typeof base === 'string' ? base : base.uri;
      this.uri = name === undefined ? baseUri : join(baseUri, name);
      this.name = nameOf(this.uri);
      const dot = this.name.lastIndexOf('.');
      this.extension = dot >= 0 ? this.name.slice(dot) : '';
      const meta = registry.get(this.uri) ?? {};
      this.size = meta.size ?? 0;
      this.creationTime = meta.creationTime;
      this.exists = meta.exists ?? false;
    }
    get parentDirectory() {
      return { uri: stripTrailingSlash(this.uri).replace(/\/[^/]+$/, '') };
    }
    move(destination: { uri: string }) {
      const meta = registry.get(this.uri) ?? {};
      registry.set(destination.uri, { ...meta, exists: true });
      registry.delete(this.uri);
    }
    delete() {
      registry.delete(this.uri);
    }
  }

  return {
    Directory,
    File,
    Paths: { document: 'file:///doc' },
    __registry: registry,
    __setListing: (entries: object[]) => {
      listing = entries;
    },
  };
});

const fileSystem = jest.requireMock('expo-file-system') as {
  __registry: Map<string, { size?: number; creationTime?: number; exists?: boolean }>;
  __setListing: (entries: object[]) => void;
};

const RECORDINGS_DIRECTORY = 'file:///doc/recordings';

beforeEach(() => {
  fileSystem.__registry.clear();
  fileSystem.__setListing([]);
});

describe('listLocalRecordings', () => {
  it('keeps only video files and sorts them newest first', async () => {
    const entries = [
      { uri: `${RECORDINGS_DIRECTORY}/snaply-old.mov`, creationTime: 1 },
      { uri: `${RECORDINGS_DIRECTORY}/notes.txt`, creationTime: 5 },
      { uri: `${RECORDINGS_DIRECTORY}/snaply-new.mp4`, creationTime: 3 },
    ];
    entries.forEach(({ uri, creationTime }) =>
      fileSystem.__registry.set(uri, { exists: true, creationTime, size: 100 }),
    );
    fileSystem.__setListing([
      new File(entries[0].uri),
      new File(entries[1].uri),
      new Directory(RECORDINGS_DIRECTORY, 'sub-folder'),
      new File(entries[2].uri),
    ]);

    const recordings = await listLocalRecordings();

    expect(recordings.map((recording) => recording.fileName)).toEqual([
      'snaply-new.mp4',
      'snaply-old.mov',
    ]);
  });

  it('falls back through the creation, modified, and current time for the timestamp', async () => {
    const uri = `${RECORDINGS_DIRECTORY}/snaply-1.mp4`;
    fileSystem.__registry.set(uri, { exists: true, size: 2048 });
    fileSystem.__setListing([new File(uri)]);

    const [recording] = await listLocalRecordings();

    expect(recording).toMatchObject({
      id: 'snaply-1.mp4',
      fileName: 'snaply-1.mp4',
      uri,
      size: 2048,
    });
    expect(typeof recording.createdAt).toBe('number');
  });
});

describe('deleteLocalRecording', () => {
  it('rejects a file that lives outside the recordings directory', async () => {
    const outsideUri = 'file:///doc/other/clip.mp4';
    fileSystem.__registry.set(outsideUri, { exists: true });

    await expect(deleteLocalRecording(outsideUri)).rejects.toThrow(
      'Only Snaply recordings can be deleted.',
    );
    expect(fileSystem.__registry.has(outsideUri)).toBe(true);
  });

  it('deletes a file that lives inside the recordings directory', async () => {
    const uri = `${RECORDINGS_DIRECTORY}/snaply-1.mp4`;
    fileSystem.__registry.set(uri, { exists: true });

    await deleteLocalRecording(uri);

    expect(fileSystem.__registry.has(uri)).toBe(false);
  });
});

describe('persistLocalRecording', () => {
  it('throws when the temporary file does not exist', async () => {
    await expect(persistLocalRecording('file:///cache/missing.mp4')).rejects.toThrow(
      'The temporary recording file does not exist.',
    );
  });

  it('preserves a supported video extension when moving the file', async () => {
    const temporaryUri = 'file:///cache/clip.mov';
    fileSystem.__registry.set(temporaryUri, { exists: true, size: 4096 });

    const recording = await persistLocalRecording(temporaryUri);

    expect(recording.fileName).toMatch(/^snaply-\d+\.mov$/);
    expect(recording.uri.startsWith(`${RECORDINGS_DIRECTORY}/`)).toBe(true);
    expect(fileSystem.__registry.has(temporaryUri)).toBe(false);
  });

  it('falls back to an mp4 extension for an unsupported source extension', async () => {
    const temporaryUri = 'file:///cache/clip.bin';
    fileSystem.__registry.set(temporaryUri, { exists: true, size: 4096 });

    const recording = await persistLocalRecording(temporaryUri);

    expect(recording.fileName).toMatch(/^snaply-\d+\.mp4$/);
  });
});
