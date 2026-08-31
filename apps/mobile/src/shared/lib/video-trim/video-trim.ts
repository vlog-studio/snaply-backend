import { requireNativeModule } from 'expo';

import type { TrimmedVideo, TrimWindowMs } from './trimmed-video';

type VideoTrimNativeModule = {
  trim(sourceUri: string, startMs: number, endMs: number): Promise<TrimmedVideo>;
};

// Resolved lazily so importing this module (directly or through a barrel) never
// touches the native registry — only an actual trim does. The screen that trims
// exists only in the dev builds, where the module is linked.
let nativeModule: VideoTrimNativeModule | undefined;

function videoTrimModule(): VideoTrimNativeModule {
  nativeModule ??= requireNativeModule<VideoTrimNativeModule>('VideoTrim');
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
 */
export function trimVideo(sourceUri: string, window: TrimWindowMs): Promise<TrimmedVideo> {
  return videoTrimModule().trim(sourceUri, window.startMs, window.endMs);
}
