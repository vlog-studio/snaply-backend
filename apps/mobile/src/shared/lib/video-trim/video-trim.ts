import { requireOptionalNativeModule } from 'expo';

import type { ProbedVideo, TrimmedVideo, TrimWindowMs } from './trimmed-video';

type VideoTrimNativeModule = {
  probe(sourceUri: string): Promise<ProbedVideo>;
  trim(sourceUri: string, startMs: number, endMs: number): Promise<TrimmedVideo>;
};

// Resolved lazily so importing this module (directly or through a barrel) never
// touches the native registry — only an actual call does. The module is linked
// in the dev builds only; Expo Go has no `VideoTrim`, and `null` is what says so.
let nativeModule: VideoTrimNativeModule | null | undefined;

function videoTrimModule(): VideoTrimNativeModule | null {
  if (nativeModule === undefined) {
    nativeModule = requireOptionalNativeModule<VideoTrimNativeModule>('VideoTrim');
  }
  return nativeModule;
}

/**
 * Cuts a `[startMs, endMs]` window out of a local video into a new MP4 file in
 * the cache directory, and reports the output's real properties (the exporter
 * lands on frame boundaries, so the request is not authoritative).
 *
 * The output is temporary, exactly like a camera recording fresh out of
 * `recordAsync`: the caller moves it into permanent storage with
 * `persistLocalRecording`. `width`/`height` are `0` when the platform could not
 * read them back; callers fall back to their own defaults.
 *
 * Rejects where the native module is not linked (Expo Go): the screen that
 * trims exists only in the dev builds, so this is a programming error there,
 * not a state to degrade into.
 */
export function trimVideo(sourceUri: string, window: TrimWindowMs): Promise<TrimmedVideo> {
  const native = videoTrimModule();
  if (!native) {
    return Promise.reject(new Error('Video trimming needs the VideoTrim native module.'));
  }
  return native.trim(sourceUri, window.startMs, window.endMs);
}

/**
 * Reads a local video file's display size and length **with its rotation
 * applied** — a phone held upright records landscape frames with a 90° flag,
 * and this is the one reader in the app that honours the flag (`expo-video`
 * reports the encoded frame instead). It is the same measurement `trimVideo`
 * makes of its output, so a captured snap and an extracted one are described
 * identically.
 *
 * Resolves to `undefined` where the native module is not linked (Expo Go) or
 * the file could not be opened; a field is `0` when the platform could open the
 * file but not read that property. Callers keep their own fallback.
 */
export async function probeVideo(sourceUri: string): Promise<ProbedVideo | undefined> {
  const native = videoTrimModule();
  if (!native) return undefined;
  try {
    return await native.probe(sourceUri);
  } catch {
    return undefined;
  }
}
