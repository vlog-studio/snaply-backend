import { act, renderHook } from '@testing-library/react-native';

import { useDeleteSnaps, type DeletableSnap } from './use-delete-snaps';

const mockDeleteLocalRecording = jest.fn();
const mockDeleteVideoThumbnail = jest.fn();
const mockRemoveSnaps = jest.fn();
const mockForgetSnapSync = jest.fn();
const mockRemoveSnapsEverywhere = jest.fn();

// Mock each dependency at its slice Public API so the test stays at the seam.
jest.mock('@/shared/lib/recording-files', () => ({
  deleteLocalRecording: (uri: string) => mockDeleteLocalRecording(uri),
}));
jest.mock('@/shared/lib/video-thumbnails', () => ({
  deleteVideoThumbnail: (uri: string) => mockDeleteVideoThumbnail(uri),
}));
jest.mock('@/entities/snap', () => ({
  useRemoveSnaps: () => mockRemoveSnaps,
  useForgetSnapSync: () => mockForgetSnapSync,
}));
jest.mock('@/entities/movie', () => ({
  useRemoveSnapsEverywhere: () => mockRemoveSnapsEverywhere,
}));

function makeRecording(id: string): DeletableSnap {
  return { id, uri: `file:///doc/recordings/${id}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteLocalRecording.mockResolvedValue(undefined);
});

describe('useDeleteSnaps', () => {
  it('deletes the file, its thumbnail, its movie references, and its metadata', async () => {
    const recording = makeRecording('snaply-1.mp4');
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([recording]);
    });

    expect(mockDeleteLocalRecording).toHaveBeenCalledWith(recording.uri);
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
    mockDeleteLocalRecording.mockImplementation((uri: string) =>
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
    expect(result.current.errorMessage).toBe('일부 스냅을 삭제하지 못했어요.'); // 일부 스냅을 삭제하지 못했어요.
  });

  it('touches no store when every file deletion fails', async () => {
    mockDeleteLocalRecording.mockRejectedValue(new Error('gone'));
    const { result } = await renderHook(() => useDeleteSnaps());

    await act(async () => {
      await result.current.deleteSnaps([makeRecording('snaply-1.mp4')]);
    });

    expect(mockRemoveSnapsEverywhere).not.toHaveBeenCalled();
    expect(mockRemoveSnaps).not.toHaveBeenCalled();
    expect(mockForgetSnapSync).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe('스냅을 삭제하지 못했어요.'); // 스냅을 삭제하지 못했어요.
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
    expect(mockDeleteLocalRecording).not.toHaveBeenCalled();
    expect(mockRemoveSnapsEverywhere).not.toHaveBeenCalled();
  });

  it('clears the deleting set and the error after a successful delete', async () => {
    mockDeleteLocalRecording.mockRejectedValueOnce(new Error('locked'));
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
    mockDeleteLocalRecording.mockRejectedValue(new Error('locked'));
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
