import { render, waitFor } from '@testing-library/react-native';

import { getSnaps } from '@/entities/snap';

import { LibraryScopeGate } from './library-scope-gate';

/**
 * In-memory stand-in for the document-directory JSON files, seeded with one
 * library per account in the envelope zustand's `persist` writes.
 */
jest.mock('@/shared/lib/local-store', () => {
  const files = new Map<string, string>();
  return {
    localStore: {
      getItem: jest.fn(async (key: string) => files.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        files.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        files.delete(key);
      }),
    },
    __files: files,
  };
});

/** The session, reduced to the one thing the gate reads: who is signed in. */
jest.mock('@/entities/session', () => {
  let user: { id: string } | null = null;
  return {
    useCurrentUser: () => user,
    useSessionHydrated: () => true,
    __signIn: (id: string | null) => {
      user = id === null ? null : { id };
    },
  };
});

const { __files: files } = jest.requireMock('@/shared/lib/local-store') as {
  __files: Map<string, string>;
};
const { __signIn: signIn } = jest.requireMock('@/entities/session') as {
  __signIn: (id: string | null) => void;
};

function snapFile(...ids: string[]): string {
  const snaps = ids.map((id) => ({
    id,
    uri: `file:///doc/recordings/${id}.mp4`,
    durationSec: 3,
    capturedAt: 1_753_200_000_000,
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  }));
  return JSON.stringify({ state: { snaps }, version: 0 });
}

describe('LibraryScopeGate', () => {
  it('gives each account its own library instead of whatever the device holds', async () => {
    files.set('snaply.snaps.user-a', snapFile('snap-a'));
    files.set('snaply.snaps.user-b', snapFile('snap-b'));

    signIn('user-a');
    const { rerender } = await render(<LibraryScopeGate />);
    await waitFor(() => expect(getSnaps().map((snap) => snap.id)).toEqual(['snap-a']));

    // The reported bug: the next account to sign in on this device saw the
    // snaps the previous one had captured.
    signIn('user-b');
    rerender(<LibraryScopeGate />);
    await waitFor(() => expect(getSnaps().map((snap) => snap.id)).toEqual(['snap-b']));

    // And signing out leaves nothing of that account behind in the process,
    // while its file stays on disk for when it comes back.
    signIn(null);
    rerender(<LibraryScopeGate />);
    await waitFor(() => expect(getSnaps()).toEqual([]));
    expect(files.get('snaply.snaps.user-b')).toBe(snapFile('snap-b'));
  });
});
