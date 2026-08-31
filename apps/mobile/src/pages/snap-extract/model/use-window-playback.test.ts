import { act, renderHook } from '@testing-library/react-native';

import { useWindowPlayback, WindowProgressIntervalSec } from './use-window-playback';

type Listener = (payload: Record<string, unknown>) => void;

const listeners = new Map<string, Listener>();
const mockUseEventListener = jest.fn(
  (_target: unknown, event: string, listener: Listener) => void listeners.set(event, listener),
);

const player = {
  muted: false,
  timeUpdateEventInterval: 0,
  currentTime: 0,
  seekBy: jest.fn((delta: number) => {
    player.currentTime += delta;
  }),
  play: jest.fn(),
  pause: jest.fn(),
};
let playerInitialized = false;
const mockUseVideoPlayer = jest.fn((_source: string, setup: (value: typeof player) => void) => {
  if (!playerInitialized) {
    playerInitialized = true;
    setup(player);
  }
  return player;
});

jest.mock('expo', () => ({
  useEventListener: (...args: [unknown, string, Listener]) => mockUseEventListener(...args),
}));

jest.mock('expo-video', () => ({
  useVideoPlayer: (...args: [string, (value: typeof player) => void]) =>
    mockUseVideoPlayer(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  playerInitialized = false;
  player.muted = false;
  player.timeUpdateEventInterval = 0;
  player.currentTime = 0;
});

describe('useWindowPlayback', () => {
  it('configures a muted player with the expected progress cadence', async () => {
    const { result } = await renderHook(() =>
      useWindowPlayback('file:///source.mp4', { startSec: 1, endSec: 4 }),
    );

    expect(mockUseVideoPlayer).toHaveBeenCalledWith('file:///source.mp4', expect.any(Function));
    expect(player.muted).toBe(true);
    expect(player.timeUpdateEventInterval).toBe(WindowProgressIntervalSec);
    expect(result.current.muted).toBe(true);
  });

  it('starts from the window when parked outside it and then pauses', async () => {
    player.currentTime = 8;
    const { result } = await renderHook(() =>
      useWindowPlayback('file:///source.mp4', { startSec: 2, endSec: 5 }),
    );

    await act(async () => result.current.togglePlayback());
    expect(player.seekBy).toHaveBeenCalledWith(-6);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(true);

    await act(async () => result.current.togglePlayback());
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('loops a playing window but never seeks from a paused Android time update', async () => {
    const { result } = await renderHook(() =>
      useWindowPlayback('file:///source.mp4', { startSec: 2, endSec: 5 }),
    );
    const onTimeUpdate = listeners.get('timeUpdate')!;

    await act(async () => onTimeUpdate({ currentTime: 5.2 }));
    expect(result.current.positionSec).toBe(5.2);
    expect(player.seekBy).not.toHaveBeenCalled();

    await act(async () => result.current.togglePlayback());
    player.seekBy.mockClear();
    await act(async () => onTimeUpdate({ currentTime: 5.2 }));
    expect(player.seekBy).toHaveBeenCalledWith(-3.2);
  });

  it('loops at the physical end only while playback is intended', async () => {
    player.currentTime = 5;
    const { result } = await renderHook(() =>
      useWindowPlayback('file:///source.mp4', { startSec: 2, endSec: 5 }),
    );
    const onPlayToEnd = listeners.get('playToEnd')!;

    await act(async () => onPlayToEnd({}));
    expect(player.seekBy).not.toHaveBeenCalled();

    await act(async () => result.current.togglePlayback());
    player.seekBy.mockClear();
    player.play.mockClear();
    player.currentTime = 5;
    await act(async () => onPlayToEnd({}));
    expect(player.seekBy).toHaveBeenCalledWith(-3);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('uses the latest window and can seek to a newly settled start explicitly', async () => {
    const { result, rerender } = await renderHook(
      ({ startSec, endSec }: { startSec: number; endSec: number }) =>
        useWindowPlayback('file:///source.mp4', { startSec, endSec }),
      { initialProps: { startSec: 0, endSec: 3 } },
    );
    await rerender({ startSec: 10, endSec: 13 });

    player.currentTime = 4;
    await act(async () => result.current.seekTo(10));
    expect(player.seekBy).toHaveBeenCalledWith(6);
    expect(result.current.positionSec).toBe(10);

    await act(async () => result.current.togglePlayback());
    player.seekBy.mockClear();
    const onTimeUpdate = listeners.get('timeUpdate')!;
    await act(async () => onTimeUpdate({ currentTime: 13 }));
    expect(player.seekBy).toHaveBeenCalledWith(-3);
  });

  it('applies sound changes to the native player', async () => {
    const { result } = await renderHook(() =>
      useWindowPlayback('file:///source.mp4', { startSec: 0, endSec: 3 }),
    );

    await act(async () => result.current.toggleMuted());
    expect(result.current.muted).toBe(false);
    expect(player.muted).toBe(false);
  });
});
