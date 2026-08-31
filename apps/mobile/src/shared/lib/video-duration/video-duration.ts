import { createVideoPlayer } from 'expo-video';

/**
 * How long to wait for a file's metadata before giving up. Reading a local file
 * takes a few tens of milliseconds; anything past this is a file the platform
 * cannot decode, and the caller has a length to fall back on.
 */
const ReadTimeoutMs = 4_000;

/**
 * Reads how long a video file actually runs, in seconds, or `undefined` when the
 * platform cannot tell.
 *
 * A player is created directly rather than through `useVideoPlayer` because this
 * is not a React concern — nothing is rendered — which means the player is *not*
 * released automatically and this module has to do it on every exit path,
 * including the timeout. One player exists at a time per call, so a caller
 * measuring a whole library must do so in sequence: the platform's pool of
 * hardware video decoders is small, and exhausting it makes players fail
 * silently (the same constraint that keeps `shared/lib/video-thumbnails` on
 * one-shot extraction rather than live players).
 *
 * The release is deferred by a tick because it runs from inside the player's own
 * event callback, and tearing a shared object down while it is emitting is not
 * something to rely on.
 */
export function readVideoDuration(uri: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const subscriptions: { remove: () => void }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    let player: ReturnType<typeof createVideoPlayer>;
    try {
      player = createVideoPlayer(uri);
      player.muted = true;
    } catch {
      resolve(undefined);
      return;
    }

    const finish = (durationSec: number | undefined) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      subscriptions.forEach((subscription) => subscription.remove());
      setTimeout(() => player.release(), 0);
      resolve(
        durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0
          ? durationSec
          : undefined,
      );
    };

    subscriptions.push(player.addListener('sourceLoad', ({ duration }) => finish(duration)));
    subscriptions.push(
      player.addListener('statusChange', ({ status }) => {
        if (status === 'readyToPlay') finish(player.duration);
        if (status === 'error') finish(undefined);
      }),
    );

    timer = setTimeout(() => finish(undefined), ReadTimeoutMs);
  });
}
