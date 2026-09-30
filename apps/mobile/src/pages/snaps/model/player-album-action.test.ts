import { AlbumSaveCopy, AlbumSaveProblem } from '@/features/save-snap-to-album';

import { playerAlbumAction } from './player-album-action';

jest.mock('@/features/save-snap-to-album', () => ({
  AlbumSaveCopy: {
    action: 'save',
    saving: 'saving',
    saved: 'saved',
    retry: 'retry',
    retryLabel: 'save again',
    openSettings: 'settings',
  },
  AlbumSaveProblem: { blocked: 'no permission', failed: 'not saved' },
}));

describe('playerAlbumAction', () => {
  const save = jest.fn();
  const openSettings = jest.fn();

  it('offers the save, and only reads while it runs and once it is done', () => {
    expect(playerAlbumAction('idle', { save, openSettings }).action).toEqual({
      label: AlbumSaveCopy.action,
      onPress: save,
    });
    expect(playerAlbumAction('saving', { save, openSettings }).action.disabled).toBe(true);
    expect(playerAlbumAction('saved', { save, openSettings }).action.onPress).toBeUndefined();
  });

  it('offers a retry with the reason when the copy could not be made', () => {
    const { action, problem } = playerAlbumAction('failed', { save, openSettings });

    expect(action.onPress).toBe(save);
    expect(problem).toBe(AlbumSaveProblem.failed);
  });

  it('sends a refused permission to the OS settings instead of retrying into the same refusal', () => {
    const { action, problem } = playerAlbumAction('blocked', { save, openSettings });

    expect(action.onPress).toBe(openSettings);
    expect(problem).toBe(AlbumSaveProblem.blocked);
  });
});
