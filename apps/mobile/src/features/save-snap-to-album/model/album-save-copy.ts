import type { AlbumSaveOutcome } from './save-snap-to-album';

/**
 * What the screens say about a save, so the player and the capture screen
 * cannot word the same outcome differently.
 */
export const AlbumSaveCopy = {
  action: '앨범에 저장',
  saving: '저장하는 중…',
  saved: '앨범에 저장했어요',
  retry: '다시 저장',
  /** The retry control's full outcome phrase, for the accessibility label. */
  retryLabel: '앨범에 다시 저장',
  openSettings: '설정에서 권한 켜기',
} as const;

/** One line for a save that did not make a copy. */
export const AlbumSaveProblem: Record<Exclude<AlbumSaveOutcome, 'saved'>, string> = {
  blocked: '앨범에 저장하려면 사진 권한이 필요해요.',
  failed: '앨범에 저장하지 못했어요.',
};
