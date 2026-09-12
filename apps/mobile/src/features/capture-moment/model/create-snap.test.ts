import type { LocalRecording } from '@/shared/lib/recording-files';

import { createSnap } from './create-snap';

const recording: LocalRecording = {
  id: 'snaply-1753200000000.mp4',
  uri: 'file:///doc/recordings/snaply-1753200000000.mp4',
  fileName: 'snaply-1753200000000.mp4',
  size: 4096,
  createdAt: 1_753_200_000_000,
};

describe('createSnap', () => {
  it('ties the snap id and uri to the recording and defaults to the upright stand-in', () => {
    const snap = createSnap(recording, { durationSec: 3 });

    expect(snap).toMatchObject({
      id: recording.id,
      uri: recording.uri,
      durationSec: 3,
      capturedAt: recording.createdAt,
      orientation: 'portrait',
    });
    expect(snap.width).toBeGreaterThan(0);
    expect(snap.height).toBeGreaterThan(snap.width);
    // A stand-in is not a measurement: the backfill has to know to come back.
    expect(snap).not.toHaveProperty('dimensionsMeasured');
  });

  it('carries the five-second duration through', () => {
    expect(createSnap(recording, { durationSec: 5 }).durationSec).toBe(5);
  });

  // The requested length is a maximum: a hold released early stops the recording
  // short of it, and the timeline draws a snap at whatever this number says.
  it('prefers the file’s measured length over the one that was asked for', () => {
    const snap = createSnap(recording, { durationSec: 3, measured: { durationSec: 1.2 } });

    expect(snap).toMatchObject({ durationSec: 1.2, durationMeasured: true });
  });

  it('leaves an unmeasurable snap on the requested length, unmarked', () => {
    const snap = createSnap(recording, { durationSec: 3, measured: {} });

    expect(snap.durationSec).toBe(3);
    expect(snap).not.toHaveProperty('durationMeasured');
  });

  // The camera records 720p, not the 1080×1920 the stand-in claims, and a phone
  // held sideways records landscape — the file is what the snap is sized by.
  it.each([
    ['portrait', 720, 1280],
    ['landscape', 1280, 720],
    ['square', 720, 720],
  ] as const)('stores the measured size and reads it as %s', (orientation, width, height) => {
    const snap = createSnap(recording, { durationSec: 3, measured: { width, height } });

    expect(snap).toMatchObject({ width, height, orientation, dimensionsMeasured: true });
  });

  // Expo Go can measure the length and not the size: each is marked on its own.
  it('marks the length measured while the size stays a stand-in', () => {
    const snap = createSnap(recording, { durationSec: 3, measured: { durationSec: 1.2 } });

    expect(snap).toMatchObject({ durationMeasured: true, width: 1080, height: 1920 });
    expect(snap).not.toHaveProperty('dimensionsMeasured');
  });

  it('keeps the stand-in when only half a size was read', () => {
    const snap = createSnap(recording, { durationSec: 3, measured: { width: 720 } });

    expect(snap).toMatchObject({ width: 1080, height: 1920, orientation: 'portrait' });
    expect(snap).not.toHaveProperty('dimensionsMeasured');
  });

  it('carries a capture place through when one was resolved', () => {
    const place = { latitude: 37.5445, longitude: 127.0557 };

    expect(createSnap(recording, { durationSec: 3, place }).place).toEqual(place);
  });

  it('omits the key entirely when no place was resolved', () => {
    expect(createSnap(recording, { durationSec: 3 })).not.toHaveProperty('place');
  });
});
