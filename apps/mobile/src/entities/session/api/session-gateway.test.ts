import { endSession, exchangeSessionCode, subscribeToSession } from './session-gateway';

type AuthCallback = (event: string, session: unknown) => void;

let authCallback: AuthCallback | undefined;
const mockUnsubscribe = jest.fn();
const mockStopAutoRefresh = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });
const mockExchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
      signOut: () => mockSignOut(),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
    },
  },
  startAuthAutoRefresh: () => mockStopAutoRefresh,
}));

const supabaseSession = {
  user: {
    id: 'user-1',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Google User' },
  },
};

describe('session gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authCallback = undefined;
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it('reports the mapped user for a session and null for none', () => {
    const changes: unknown[] = [];
    subscribeToSession((change) => changes.push(change));

    authCallback!('SIGNED_IN', supabaseSession);
    authCallback!('SIGNED_OUT', null);

    expect(changes).toEqual([
      {
        user: {
          id: 'user-1',
          provider: 'google',
          displayName: 'Google User',
          avatarUrl: undefined,
        },
        isRecovery: false,
      },
      { user: null, isRecovery: false },
    ]);
  });

  it('flags a password-recovery event as a recovery session', () => {
    const changes: { isRecovery: boolean }[] = [];
    subscribeToSession((change) => changes.push(change));

    authCallback!('PASSWORD_RECOVERY', supabaseSession);

    expect(changes[0].isRecovery).toBe(true);
  });

  it('stops both the subscription and token auto-refresh on cleanup', () => {
    const cleanup = subscribeToSession(() => {});

    cleanup();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockStopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('ends the backend session on endSession', async () => {
    await endSession();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('reports whether a deep-link code exchange succeeded', async () => {
    // The failure path logs the backend message in development builds.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(exchangeSessionCode('code-1')).resolves.toBe(true);

    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } });
    await expect(exchangeSessionCode('code-2')).resolves.toBe(false);

    warn.mockRestore();
  });
});
