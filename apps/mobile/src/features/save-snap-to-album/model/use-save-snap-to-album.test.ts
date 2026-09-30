import { act, renderHook } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import { useSaveSnapToAlbum } from './use-save-snap-to-album';

const mockSaveSnapToAlbum = jest.fn();

jest.mock('./save-snap-to-album', () => ({
  saveSnapToAlbum: (snap: unknown, options: unknown) => mockSaveSnapToAlbum(snap, options),
}));

function makeSnap(id: string): Snap {
  return {
    id,
    uri: `file:///doc/recordings/${id}`,
    durationSec: 3,
    capturedAt: 1_000,
    width: 720,
    height: 1280,
    orientation: 'portrait',
  };
}

describe('useSaveSnapToAlbum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads saving while the copy is made, then how it ended, for that snap only', async () => {
    let finish: (outcome: string) => void = () => {};
    mockSaveSnapToAlbum.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = await renderHook(() => useSaveSnapToAlbum());

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.save(makeSnap('snaply-1.mp4'));
    });
    expect(result.current.stateOf('snaply-1.mp4')).toBe('saving');
    expect(result.current.stateOf('snaply-2.mp4')).toBe('idle');

    await act(async () => {
      finish('saved');
      await pending;
    });
    expect(result.current.stateOf('snaply-1.mp4')).toBe('saved');
    expect(mockSaveSnapToAlbum).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snaply-1.mp4' }),
      {
        ask: true,
      },
    );
  });

  it('ignores a second tap while a copy is being made', async () => {
    mockSaveSnapToAlbum.mockReturnValue(new Promise(() => {}));
    const { result } = await renderHook(() => useSaveSnapToAlbum());

    await act(async () => {
      void result.current.save(makeSnap('snaply-1.mp4'));
      void result.current.save(makeSnap('snaply-1.mp4'));
    });

    expect(mockSaveSnapToAlbum).toHaveBeenCalledTimes(1);
  });

  it('forgets how the last save ended once reset, so the snap can be saved again', async () => {
    mockSaveSnapToAlbum.mockResolvedValue('blocked');
    const { result } = await renderHook(() => useSaveSnapToAlbum());

    await act(async () => {
      await result.current.save(makeSnap('snaply-1.mp4'));
    });
    expect(result.current.stateOf('snaply-1.mp4')).toBe('blocked');

    await act(async () => result.current.reset());
    expect(result.current.stateOf('snaply-1.mp4')).toBe('idle');
  });
});
