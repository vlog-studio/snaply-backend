import { act, renderHook } from '@testing-library/react-native';

import type { SnapSyncEntry } from '@/entities/snap';

import { useDeleteSnaps, type DeletableSnap } from './use-delete-snaps';

const mockDeleteSnapFile = jest.fn();
const mockDeleteVideoThumbnail = jest.fn();
const mockMoveVideoThumbnail = jest.fn();
const mockRemoveSnaps = jest.fn();
const mockForgetSnapSync = jest.fn();
const mockMarkRemovedFromDevice = jest.fn();
const mockRemoveSnapsEverywhere = jest.fn();
let mockEntries: Record<string, SnapSyncEntry> = {};

// Mock each dependency at its slice Public API so the test stays at the seam.
jest.mock('@/shared/lib/video-thumbnails', () => ({
  deleteVideoThumbnail: (uri: string) => mockDeleteVideoThumbnail(uri),
  moveVideoThumbnail: (from: string, to: string) => mockMoveVideoThumbnail(from, to),
}));
jest.mock('@/shared/lib/server-snap-files', () => ({
  serverSnapFileUri: (videoId: string) => `file:///cache/server-snaps/${videoId}.mp4`,
}));
jest.mock('@/entities/snap', () => ({
  deleteSnapFile: (uri: string) => mockDeleteSnapFile(uri),
  getSnapSyncEntries: () => mockEntries,
  useRemoveSnaps: () => mockRemoveSnaps,
  useForgetSnapSync: () => mockForgetSnapSync,
  useMarkSnapsRemovedFromDevice: () => mockMarkRemovedFromDevice,
}));
jest.mock('@/entities/movie', () => ({
  useRemoveSnapsEverywhere: () => mockRemoveSnapsEverywhere,
}));

function makeRecording(id: string): DeletableSnap {
  return { id, uri: `file:///doc/recordings/${id}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEntries = {};
  mockDeleteSnapFile.mockResolvedValue(undefined);
  mockMoveVideoThumbnail.mockResolvedValue(undefined);
});

describe('useDeleteSnaps', () => {
  it('deletes the file, its thumbnail, its movie references, and its metadata', async () => {
    const recording = makeRecording('snaply-1.mp4');
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([recording]);
    });

    expect(mockDeleteSnapFile).toHaveBeenCalledWith(recording.uri);
    expect(mockDeleteVideoThumbnail).toHaveBeenCalledWith(recording.uri);
    expect(mockRemoveSnapsEverywhere).toHaveBeenCalledWith(['snaply-1.mp4']);
    expect(mockRemoveSnaps).toHaveBeenCalledWith(['snaply-1.mp4']);
    expect(mockForgetSnapSync).toHaveBeenCalledWith(['snaply-1.mp4']);
  });

  it('returns the deleted ids', async () => {
    const targets = [makeRecording('snaply-1.mp4'), makeRecording('snaply-2.mp4')];
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteSnaps(targets);
    });

    expect(deletedIds).toEqual(['snaply-1.mp4', 'snaply-2.mp4']);
  });

  it('commits references and metadata in one write per batch', async () => {
    const targets = [makeRecording('snaply-1.mp4'), makeRecording('snaply-2.mp4')];
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps(targets);
    });

    expect(mockRemoveSnapsEverywhere).toHaveBeenCalledTimes(1);
    expect(mockRemoveSnaps).toHaveBeenCalledTimes(1);
    expect(mockRemoveSnaps).toHaveBeenCalledWith(['snaply-1.mp4', 'snaply-2.mp4']);
  });

  it('keeps the metadata of a snap whose file could not be deleted', async () => {
    const kept = makeRecording('snaply-1.mp4');
    const deleted = makeRecording('snaply-2.mp4');
    mockDeleteSnapFile.mockImplementation((uri: string) =>
      uri === kept.uri ? Promise.reject(new Error('locked')) : Promise.resolve(undefined),
    );
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteSnaps([kept, deleted]);
    });

    expect(deletedIds).toEqual(['snaply-2.mp4']);
    expect(mockRemoveSnaps).toHaveBeenCalledWith(['snaply-2.mp4']);
    expect(mockDeleteVideoThumbnail).not.toHaveBeenCalledWith(kept.uri);
    expect(result.current.errorMessage).toBe(
      '\uC77C\uBD80 \uC2A4\uB0C5\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    ); // 일부 스냅을 삭제하지 못했어요. 다시 시도해 주세요.
  });

  it('touches no store when every file deletion fails', async () => {
    mockDeleteSnapFile.mockRejectedValue(new Error('gone'));
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([makeRecording('snaply-1.mp4')]);
    });

    expect(mockRemoveSnapsEverywhere).not.toHaveBeenCalled();
    expect(mockRemoveSnaps).not.toHaveBeenCalled();
    expect(mockForgetSnapSync).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe(
      '\uC2A4\uB0C5\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    ); // 스냅을 삭제하지 못했어요. 다시 시도해 주세요.
  });

  it('still commits the delete when clearing the thumbnail cache fails', async () => {
    // The file is already gone at that point, so a derived-cache failure must
    // not leave the metadata and movie references behind.
    mockDeleteVideoThumbnail.mockImplementation(() => {
      throw new Error('cache locked');
    });
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteSnaps([makeRecording('snaply-1.mp4')]);
    });

    expect(deletedIds).toEqual(['snaply-1.mp4']);
    expect(mockRemoveSnaps).toHaveBeenCalledWith(['snaply-1.mp4']);
    expect(mockRemoveSnapsEverywhere).toHaveBeenCalledWith(['snaply-1.mp4']);
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('does nothing for an empty selection', async () => {
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = ['unset'];
    await act(async () => {
      deletedIds = await result.current.deleteSnaps([]);
    });

    expect(deletedIds).toEqual([]);
    expect(mockDeleteSnapFile).not.toHaveBeenCalled();
    expect(mockRemoveSnapsEverywhere).not.toHaveBeenCalled();
  });

  it('clears the deleting set and the error after a successful delete', async () => {
    mockDeleteSnapFile.mockRejectedValueOnce(new Error('locked'));
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([makeRecording('snaply-1.mp4')]);
    });
    expect(result.current.errorMessage).toBeDefined();

    await act(async () => {
      await result.current.deleteSnaps([makeRecording('snaply-2.mp4')]);
    });

    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.deletingIds.size).toBe(0);
  });

  it('clears the error on request', async () => {
    mockDeleteSnapFile.mockRejectedValue(new Error('locked'));
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([makeRecording('snaply-1.mp4')]);
    });
    await act(async () => {
      result.current.clearError();
    });

    expect(result.current.errorMessage).toBeUndefined();
  });
});

describe('useDeleteSnaps — from this device only', () => {
  const kept = (videoId: string): SnapSyncEntry => ({
    status: 'uploaded',
    videoId,
    expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
  });

  it('deletes the original file only, and keeps the snap playing from the server copy', async () => {
    mockEntries = { 'snaply-1.mp4': kept('video-1') };
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteFromDevice([makeRecording('snaply-1.mp4')]);
    });

    expect(deletedIds).toEqual(['snaply-1.mp4']);
    expect(mockDeleteSnapFile).toHaveBeenCalledWith('file:///doc/recordings/snaply-1.mp4');
    expect(mockMoveVideoThumbnail).toHaveBeenCalledWith(
      'file:///doc/recordings/snaply-1.mp4',
      'file:///cache/server-snaps/video-1.mp4',
    );
    expect(mockMarkRemovedFromDevice).toHaveBeenCalledWith([
      { id: 'snaply-1.mp4', uri: 'file:///cache/server-snaps/video-1.mp4' },
    ]);
    // The snap, its movies, and its upload record all stay; no DELETE is owed.
    expect(mockRemoveSnaps).not.toHaveBeenCalled();
    expect(mockRemoveSnapsEverywhere).not.toHaveBeenCalled();
    expect(mockForgetSnapSync).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('leaves alone every snap that has no kept copy to fall back on', async () => {
    mockEntries = {
      'snaply-expired.mp4': { status: 'expired', videoId: 'video-2' },
      'snaply-failed.mp4': { status: 'failed', attempts: 1 },
      'snaply-late.mp4': { status: 'uploaded', videoId: 'video-3', expiresAt: Date.now() - 1 },
      'video-4': kept('video-4'),
    };
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = ['unset'];
    await act(async () => {
      deletedIds = await result.current.deleteFromDevice([
        makeRecording('snaply-pending.mp4'),
        makeRecording('snaply-expired.mp4'),
        makeRecording('snaply-failed.mp4'),
        makeRecording('snaply-late.mp4'),
        { ...makeRecording('video-4'), origin: 'server' },
      ]);
    });

    expect(deletedIds).toEqual([]);
    expect(mockDeleteSnapFile).not.toHaveBeenCalled();
    expect(mockMarkRemovedFromDevice).not.toHaveBeenCalled();
  });

  it('asks again at the moment of deleting, so an expiry learned mid-batch keeps the file', async () => {
    mockEntries = { 'snaply-1.mp4': kept('video-1'), 'snaply-2.mp4': kept('video-2') };
    mockDeleteSnapFile.mockImplementation(async (uri: string) => {
      // The reconcile marks the second snap expired while the first file goes.
      if (uri.endsWith('snaply-1.mp4')) {
        mockEntries = { ...mockEntries, 'snaply-2.mp4': { status: 'expired', videoId: 'video-2' } };
      }
    });
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteFromDevice([
        makeRecording('snaply-1.mp4'),
        makeRecording('snaply-2.mp4'),
      ]);
    });

    expect(deletedIds).toEqual(['snaply-1.mp4']);
    expect(mockDeleteSnapFile).toHaveBeenCalledTimes(1);
  });

  it('keeps a snap whose file could not be deleted, and says some were not', async () => {
    mockEntries = { 'snaply-1.mp4': kept('video-1'), 'snaply-2.mp4': kept('video-2') };
    mockDeleteSnapFile.mockImplementation((uri: string) =>
      uri.endsWith('snaply-1.mp4') ? Promise.reject(new Error('locked')) : Promise.resolve(),
    );
    const { result } = await renderHook(() => useDeleteSnaps());

    let deletedIds: string[] = [];
    await act(async () => {
      deletedIds = await result.current.deleteFromDevice([
        makeRecording('snaply-1.mp4'),
        makeRecording('snaply-2.mp4'),
      ]);
    });

    expect(deletedIds).toEqual(['snaply-2.mp4']);
    expect(mockMarkRemovedFromDevice).toHaveBeenCalledWith([
      { id: 'snaply-2.mp4', uri: 'file:///cache/server-snaps/video-2.mp4' },
    ]);
    expect(result.current.errorMessage).toBe(
      '\uC77C\uBD80 \uC2A4\uB0C5\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    ); // 일부 스냅을 삭제하지 못했어요. 다시 시도해 주세요.
  });

  it('still keeps the snap when its cover could not be moved', async () => {
    mockEntries = { 'snaply-1.mp4': kept('video-1') };
    mockMoveVideoThumbnail.mockRejectedValue(new Error('cache locked'));
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteFromDevice([makeRecording('snaply-1.mp4')]);
    });

    expect(mockMarkRemovedFromDevice).toHaveBeenCalledTimes(1);
    expect(result.current.errorMessage).toBeUndefined();
  });
});
