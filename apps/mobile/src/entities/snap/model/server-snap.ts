/**
 * A snap as the server's list describes it — what another device needs to put
 * it in its library without having the file (SNAP-15). Built from the list at
 * the `api` boundary; nothing here is a wire type.
 */
export type ServerSnap = {
  videoId: string;
  /**
   * Whether the upload finished. Only a finished upload is a snap anywhere
   * else; a row that got its upload address and nothing more is not.
   */
  ready: boolean;
  /** The app's own name for the snap, as the device that shot it registered it. */
  clientId?: string;
  /** Capture time (epoch ms); the upload time when the capture time was never sent. */
  capturedAt: number;
  /** Length in seconds, and whether the server measured it or only rounded the report. */
  durationSec: number;
  durationMeasured: boolean;
  /** Display size of the playable copy; absent when the server has not measured it. */
  width?: number;
  height?: number;
  /** A signed, short-lived address of the cover frame. Fetch it now or not at all. */
  thumbnailUrl?: string;
  /** When the server's copy runs out (epoch ms), for a finished upload. */
  expiresAt?: number;
};

/** What the server knows about a snap that left its list. */
export type ServerSnapFate = { state: 'live' } | { state: 'removed'; reason: 'user' | 'expired' };
