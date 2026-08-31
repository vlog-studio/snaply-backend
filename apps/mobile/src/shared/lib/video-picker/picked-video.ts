/** A video chosen from the device library, copied into the app's cache. */
export type PickedVideo = {
  /** Local `file://` URI of the picked copy. */
  uri: string;
  /** The video's length when the picker could read it. */
  durationSec?: number;
};
