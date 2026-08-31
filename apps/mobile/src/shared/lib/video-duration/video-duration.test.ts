import { readVideoDuration } from './video-duration';

/**
 * A stand-in for the one `expo-video` player this module creates. Only the
 * surface the module touches: two events, a duration, and a release.
 */
type FakePlayer = {
  muted: boolean;
  duration: number;
  release: jest.Mock;
  addListener: jest.Mock;
  emit: (event: string, payload: unknown) => void;
  listenerCount: () => number;
};

function makePlayer(duration = 0): FakePlayer {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    muted: false,
    duration,
    release: jest.fn(),
    addListener: jest.fn((event: string, listener: (payload: unknown) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    }),
    emit: (event, payload) => listeners.get(event)?.forEach((listener) => listener(payload)),
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
}

const mockCreateVideoPlayer = jest.fn();

jest.mock('expo-video', () => ({
  createVideoPlayer: (uri: string) => mockCreateVideoPlayer(uri),
}));

describe('readVideoDuration', () => {
  const uri = 'file:///documents/snap.mov';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('answers with the length the loaded source reports', async () => {
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    player.emit('sourceLoad', { duration: 1.2 });

    await expect(reading).resolves.toBe(1.2);
    expect(mockCreateVideoPlayer).toHaveBeenCalledWith(uri);
  });

  it('answers with the player’s own duration when it becomes ready to play', async () => {
    const player = makePlayer(4.5);
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    player.emit('statusChange', { status: 'readyToPlay' });

    await expect(reading).resolves.toBe(4.5);
  });

  // The caller has an assumed length to fall back on, so an unreadable file is
  // answered rather than left pending.
  it('gives up when the player reports an error', async () => {
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    player.emit('statusChange', { status: 'error' });

    await expect(reading).resolves.toBeUndefined();
  });

  // A player that reports a length no video can have has told us nothing.
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['infinite', Number.POSITIVE_INFINITY],
    ['not a number', Number.NaN],
  ])('rejects a %s duration', async (_case, duration) => {
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    player.emit('sourceLoad', { duration });

    await expect(reading).resolves.toBeUndefined();
  });

  it('gives up on a file the platform never answers for', async () => {
    jest.useFakeTimers();
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    jest.advanceTimersByTime(4_000);

    await expect(reading).resolves.toBeUndefined();
  });

  it('answers without a player when one cannot be created', async () => {
    mockCreateVideoPlayer.mockImplementation(() => {
      throw new Error('unsupported file');
    });

    await expect(readVideoDuration(uri)).resolves.toBeUndefined();
  });

  // The player is created outside React, so nothing releases it automatically:
  // leaking one per snap would exhaust the platform's decoder pool part-way
  // through the library backfill.
  it.each([
    ['a length was read', (player: FakePlayer) => player.emit('sourceLoad', { duration: 2 })],
    ['the load failed', (player: FakePlayer) => player.emit('statusChange', { status: 'error' })],
  ])('releases the player and drops its listeners once %s', async (_case, settle) => {
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    settle(player);
    await reading;
    // The release is deferred a tick, because it runs from inside the player's
    // own event callback.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(player.release).toHaveBeenCalledTimes(1);
    expect(player.listenerCount()).toBe(0);
  });

  it('releases the player once even when the file times out', async () => {
    jest.useFakeTimers();
    const player = makePlayer();
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    jest.advanceTimersByTime(4_000);
    await reading;
    jest.advanceTimersByTime(1);

    expect(player.release).toHaveBeenCalledTimes(1);
  });

  // Both events fire on a healthy load; the first answer is the answer, and the
  // second must not release a player that is already gone.
  it('settles once when the source loads and the player then becomes ready', async () => {
    const player = makePlayer(9);
    mockCreateVideoPlayer.mockReturnValue(player);

    const reading = readVideoDuration(uri);
    player.emit('sourceLoad', { duration: 2 });
    player.emit('statusChange', { status: 'readyToPlay' });

    await expect(reading).resolves.toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player.release).toHaveBeenCalledTimes(1);
  });
});
