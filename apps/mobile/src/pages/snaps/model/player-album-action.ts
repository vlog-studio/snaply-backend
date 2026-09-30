import {
  AlbumSaveCopy,
  AlbumSaveProblem,
  type AlbumSaveState,
} from '@/features/save-snap-to-album';

export type PlayerAlbumAction = {
  /** The player's top-edge control; its label is also where the save stands. */
  action: { label: string; accessibilityLabel?: string; onPress?: () => void; disabled?: boolean };
  /** One line under the video for a save that made no copy. */
  problem?: string;
};

/**
 * What the snap player offers for saving the snap on screen to the album
 * (SNAP-17), given where its save stands. A refused permission turns the
 * control into the way out — the OS settings — rather than a retry that would
 * be refused again.
 */
export function playerAlbumAction(
  state: AlbumSaveState,
  handlers: { save: () => void; openSettings: () => void },
): PlayerAlbumAction {
  switch (state) {
    case 'idle':
      return { action: { label: AlbumSaveCopy.action, onPress: handlers.save } };
    case 'saving':
      return { action: { label: AlbumSaveCopy.saving, disabled: true } };
    case 'saved':
      return { action: { label: AlbumSaveCopy.saved } };
    case 'failed':
      return {
        action: {
          label: AlbumSaveCopy.retry,
          accessibilityLabel: AlbumSaveCopy.retryLabel,
          onPress: handlers.save,
        },
        problem: AlbumSaveProblem.failed,
      };
    case 'blocked':
      return {
        action: { label: AlbumSaveCopy.openSettings, onPress: handlers.openSettings },
        problem: AlbumSaveProblem.blocked,
      };
  }
}
