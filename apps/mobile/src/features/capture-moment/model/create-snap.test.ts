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
  it('ties the snap id and uri to the recording and defaults to portrait', () => {
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
  });

  it('carries the five-second duration through', () => {
    expect(createSnap(recording, { durationSec: 5 }).durationSec).toBe(5);
  });

  // The requested length is a maximum: a hold released early stops the recording
  // short of it, and the timeline draws a snap at whatever this number says.
  it('prefers the file’s measured length over the one that was asked for', () => {
    const snap = createSnap(recording, { durationSec: 3, measuredDurationSec: 1.2 });

    expect(snap).toMatchObject({ durationSec: 1.2, durationMeasured: true });
  });

  it('leaves an unmeasurable snap on the requested length, unmarked', () => {
    const snap = createSnap(recording, { durationSec: 3 });

    expect(snap.durationSec).toBe(3);
    expect(snap).not.toHaveProperty('durationMeasured');
  });

  it('carries a capture place through when one was resolved', () => {
    const place = { latitude: 37.5445, longitude: 127.0557 };

    expect(createSnap(recording, { durationSec: 3, place }).place).toEqual(place);
  });

  it('omits the key entirely when no place was resolved', () => {
    expect(createSnap(recording, { durationSec: 3 })).not.toHaveProperty('place');
  });
});
