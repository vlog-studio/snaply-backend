import { act, renderHook } from '@testing-library/react-native';

import { useRemoveSnaps, useSnaps } from '@/entities/snap';

import { useExtractSnap } from './use-extract-snap';

jest.mock('@/shared/lib/local-store', () => ({
  localStore: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/shared/lib/video-trim', () => ({
  trimVideo: jest.fn().mockResolvedValue({
    uri: 'file:///cache/video-trim/trim-1.mp4',
    width: 1920,
    height: 1080,
    durationMs: 2500,
  }),
}));

jest.mock('@/shared/lib/recording-files', () => ({
  persistLocalRecording: jest.fn().mockResolvedValue({
    id: 'snaply-extracted.mp4',
    uri: 'file:///documents/recordings/snaply-extracted.mp4',
    fileName: 'snaply-extracted.mp4',
    size: 1024,
    createdAt: 1_700_000_000_000,
  }),
}));

function useExtractionWithLibrary() {
  return {
    extraction: useExtractSnap(),
    snaps: useSnaps(),
    removeSnaps: useRemoveSnaps(),
  };
}

describe('extracted snap library integration', () => {
  it('lands the persisted cut in the real snap store with upload-ready metadata', async () => {
    const { result } = await renderHook(useExtractionWithLibrary);

    await act(async () => {
      await result.current.extraction.extractSnap('file:///cache/source.mp4', 1, 3.5);
    });

    expect(result.current.snaps).toContainEqual({
      id: 'snaply-extracted.mp4',
      uri: 'file:///documents/recordings/snaply-extracted.mp4',
      capturedAt: 1_700_000_000_000,
      durationSec: 2.5,
      durationMeasured: true,
      width: 1920,
      height: 1080,
      orientation: 'landscape',
    });

    await act(async () => result.current.removeSnaps(['snaply-extracted.mp4']));
  });
});
