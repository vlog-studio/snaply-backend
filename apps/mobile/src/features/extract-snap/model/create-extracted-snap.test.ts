import type { LocalRecording } from '@/shared/lib/recording-files';
import type { TrimmedVideo } from '@/shared/lib/video-trim';

import { createExtractedSnap } from './create-extracted-snap';

const recording: LocalRecording = {
  id: 'snaply-1700000000000.mp4',
  uri: 'file:///documents/recordings/snaply-1700000000000.mp4',
  fileName: 'snaply-1700000000000.mp4',
  size: 1024,
  createdAt: 1_700_000_000_000,
};

function trimmed(overrides: Partial<TrimmedVideo> = {}): TrimmedVideo {
  return {
    uri: 'file:///cache/video-trim/trim-abc.mp4',
    width: 1920,
    height: 1080,
    durationMs: 3200,
    ...overrides,
  };
}

describe('createExtractedSnap', () => {
  it('ties the snap to its recording and measures its length off the file', () => {
    const snap = createExtractedSnap(recording, { trimmed: trimmed(), requestedDurationSec: 3 });

    expect(snap.id).toBe(recording.id);
    expect(snap.uri).toBe(recording.uri);
    expect(snap.capturedAt).toBe(recording.createdAt);
    expect(snap.durationSec).toBe(3.2);
    expect(snap.durationMeasured).toBe(true);
  });

  it.each([
    ['landscape', 1920, 1080],
    ['portrait', 1080, 1920],
    ['square', 720, 720],
  ] as const)('stores the real dimensions and reads them as %s', (orientation, width, height) => {
    const snap = createExtractedSnap(recording, {
      trimmed: trimmed({ width, height }),
      requestedDurationSec: 3,
    });

    expect(snap.width).toBe(width);
    expect(snap.height).toBe(height);
    expect(snap.orientation).toBe(orientation);
  });

  it('falls back to the requested length when the file was unreadable', () => {
    const snap = createExtractedSnap(recording, {
      trimmed: trimmed({ durationMs: 0 }),
      requestedDurationSec: 2.5,
    });

    expect(snap.durationSec).toBe(2.5);
    expect(snap.durationMeasured).toBeUndefined();
  });

  it('falls back to the portrait stand-in when dimensions were unreadable', () => {
    const snap = createExtractedSnap(recording, {
      trimmed: trimmed({ width: 0, height: 0 }),
      requestedDurationSec: 3,
    });

    expect(snap.width).toBe(1080);
    expect(snap.height).toBe(1920);
    expect(snap.orientation).toBe('portrait');
  });

  it('carries no place — a gallery video was not shot where the user stands', () => {
    const snap = createExtractedSnap(recording, { trimmed: trimmed(), requestedDurationSec: 3 });
    expect('place' in snap).toBe(false);
  });
});
