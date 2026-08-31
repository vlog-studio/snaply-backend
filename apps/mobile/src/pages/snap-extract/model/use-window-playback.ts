import { useEventListener } from 'expo';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';

/** How often the player reports its position, in seconds. */
export const WindowProgressIntervalSec = 0.25;

/**
 * A module-level setter, because the React Compiler lint rejects a property
 * write on a value a hook returned when it happens in the component's own
 * closures — the same structural workaround as the gesture factories
 * (`docs/frameworks/animations-and-gestures.md`).
 */
function applyMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

export type PlaybackWindow = {
  startSec: number;
  endSec: number;
};

/**
 * Plays the source video looped inside the extraction window: reaching the
 * window's end seeks back to its start, so the stage always shows exactly the
 * cut the window describes — what watching before extracting is for.
 *
 * `expo-video` facts this leans on (see `pages/movie/ui/cut-player.tsx` and
 * `docs/frameworks/animations-and-gestures.md`): the player is keyed to its
 * mount-time source (the page remounts per source, so the source never
 * changes under the hook); seeks go through `seekBy` deltas rather than
 * `currentTime` writes; and on Android `timeUpdate` fires even while paused,
 * so every position-driven decision is gated on "meant to be playing" or a
 * parked stage would loop itself.
 */
export function useWindowPlayback(sourceUri: string, window: PlaybackWindow) {
  const windowRef = useRef(window);
  useEffect(() => {
    windowRef.current = window;
  }, [window]);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const setPlaying = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  };

  const [muted, setMuted] = useState(true);
  const [positionSec, setPositionSec] = useState(0);

  const player = useVideoPlayer(sourceUri, (instance) => {
    instance.muted = true;
    instance.timeUpdateEventInterval = WindowProgressIntervalSec;
  });

  useEffect(() => {
    applyMuted(player, muted);
  }, [player, muted]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    setPositionSec(currentTime);
    if (!isPlayingRef.current) return;
    const { startSec, endSec } = windowRef.current;
    if (currentTime >= endSec || currentTime < startSec - WindowProgressIntervalSec) {
      player.seekBy(startSec - currentTime);
    }
  });

  // The file itself can run out (a window that reaches the source's end);
  // loop the same way the boundary watch does.
  useEventListener(player, 'playToEnd', () => {
    if (!isPlayingRef.current) return;
    player.seekBy(windowRef.current.startSec - player.currentTime);
    player.play();
  });

  // Takes the target explicitly rather than reading `windowRef`: the caller
  // seeks in the same event that *sets* a new window, before the ref's sync
  // effect has run, and reading the ref there seeks to the previous window.
  const seekTo = (positionSec: number) => {
    player.seekBy(positionSec - player.currentTime);
    setPositionSec(positionSec);
  };

  const togglePlayback = () => {
    if (isPlayingRef.current) {
      player.pause();
      setPlaying(false);
      return;
    }
    // A stage parked outside the window starts the loop from the window.
    const { startSec, endSec } = windowRef.current;
    if (player.currentTime < startSec || player.currentTime >= endSec) {
      player.seekBy(startSec - player.currentTime);
    }
    player.play();
    setPlaying(true);
  };

  return {
    player,
    isPlaying,
    togglePlayback,
    positionSec,
    muted,
    toggleMuted: () => setMuted((current) => !current),
    seekTo,
  };
}
