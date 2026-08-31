/** The window to cut, in milliseconds from the source's start. */
export type TrimWindowMs = {
  startMs: number;
  endMs: number;
};

/** A trimmed video file in the cache directory, with its measured properties. */
export type TrimmedVideo = {
  /** File URI of the trimmed MP4. Temporary — move it before relying on it. */
  uri: string;
  /** Display width in pixels, rotation applied; `0` when unreadable. */
  width: number;
  /** Display height in pixels, rotation applied; `0` when unreadable. */
  height: number;
  /** The output file's real length; `0` when unreadable. */
  durationMs: number;
};
