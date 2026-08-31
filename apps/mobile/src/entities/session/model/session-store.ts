import { create } from 'zustand';

import { endSession, exchangeSessionCode, subscribeToSession } from '../api/session-gateway';

import type { User } from './user';

type SessionState = {
  user: User | null;
  /** True once Supabase's initial session has been read back from storage. */
  hasHydrated: boolean;
  /**
   * True while the user is inside a password-recovery session (arrived via a
   * reset deep link). The route guard forces the update-password screen until
   * the new password is set, even though a session technically exists.
   */
  isRecovering: boolean;
  /**
   * True once the backend has answered `403 ACCOUNT_PENDING_DELETION` — the
   * account is soft-deleted and inside its grace period. Auth still succeeds
   * (the auth backend account survives until the purge), so the route guard
   * forces the restore screen instead of the app.
   */
  isPendingDeletion: boolean;
  /**
   * When the soft-deleted account stops being recoverable, as reported by the
   * backend alongside the 403. Null when the backend did not say — the restore
   * screen then states the consequence without a deadline rather than guessing
   * one from a local clock.
   */
  purgeAfter: Date | null;
};

/**
 * Owns the app's view of the session. Under the "the auth backend owns the
 * session" model the tokens live in that backend's client (persisted via
 * SecureStore); this store only mirrors the derived `User` so screens and the
 * route guard can react synchronously. `initSession` is the single writer for
 * backend-driven changes (restore on launch, token refresh, sign-out).
 *
 * Everything backend-specific sits behind `api/session-gateway`, so this module
 * knows only the session domain.
 *
 * Exported for co-located tests only. Application code must consume the focused
 * selector hooks below through the slice Public API.
 */
export const useSessionStore = create<SessionState>()(() => ({
  user: null,
  hasHydrated: false,
  isRecovering: false,
  isPendingDeletion: false,
  purgeAfter: null,
}));

/**
 * Subscribe the store to authentication-backend session changes. Call once from
 * the root layout; returns a cleanup function. The subscription fires
 * immediately with the restored (or absent) initial session, which is what
 * flips `hasHydrated` and releases the splash overlay.
 */
export function initSession(): () => void {
  return subscribeToSession(({ user, isRecovery }) => {
    useSessionStore.setState({
      user,
      hasHydrated: true,
      ...(isRecovery ? { isRecovering: true } : {}),
    });
  });
}

/**
 * Write a user into the store directly. Used by the sign-in action for
 * immediate feedback (and by the offline mock provider, which never reaches the
 * backend); the auth listener reconciles the same value for real sign-ins.
 */
function setSessionUser(user: User): void {
  useSessionStore.setState({ user });
}

/** End the backend session; the auth listener clears the mirrored user too. */
async function signOut(): Promise<void> {
  await endSession();
  // Pending deletion is a property of the account that was signed in; the next
  // sign-in (possibly another account) re-detects it from the backend's 403.
  useSessionStore.setState({
    user: null,
    isRecovering: false,
    isPendingDeletion: false,
    purgeAfter: null,
  });
}

/**
 * Enter/leave the pending-deletion state. `markPendingDeletion` is called by
 * the app-layer bridge whenever a request fails with
 * `ACCOUNT_PENDING_DELETION`, carrying the deadline that response reported;
 * `clearPendingDeletion` by the restore action once the backend confirms the
 * account is active again.
 *
 * A known deadline survives a later 403 that omits one — several requests fail
 * per entry, and losing the date to whichever landed last would blank the
 * restore screen's read-out for no reason.
 */
export function markPendingDeletion(purgeAfter?: Date): void {
  useSessionStore.setState((state) => ({
    isPendingDeletion: true,
    purgeAfter: purgeAfter ?? state.purgeAfter,
  }));
}

export function clearPendingDeletion(): void {
  useSessionStore.setState({ isPendingDeletion: false, purgeAfter: null });
}

/**
 * Enter/leave the password-recovery state. `setRecovering` is called by the
 * deep-link handler when a reset link lands; `finishPasswordRecovery` is called
 * by the update-password action once the new password is saved.
 */
function setRecovering(value: boolean): void {
  useSessionStore.setState({ isRecovering: value });
}

function finishPasswordRecovery(): void {
  useSessionStore.setState({ isRecovering: false });
}

/**
 * Exchange a PKCE code from an auth email deep link for a session. Called by the
 * `/auth/callback` and `/auth/reset` route handlers. For recovery, the flag is
 * set before the exchange so the guard never flashes the app between "signed in"
 * and "recovering". The auth listener mirrors the resulting user. Returns
 * whether the exchange succeeded.
 */
export async function exchangeAuthCode(
  code: string,
  options?: { recovery?: boolean },
): Promise<boolean> {
  if (options?.recovery) setRecovering(true);
  const exchanged = await exchangeSessionCode(code);
  if (!exchanged && options?.recovery) setRecovering(false);
  return exchanged;
}

export function useCurrentUser(): User | null {
  return useSessionStore((state) => state.user);
}

export function useIsAuthenticated(): boolean {
  return useSessionStore((state) => state.user !== null);
}

export function useSessionHydrated(): boolean {
  return useSessionStore((state) => state.hasHydrated);
}

export function useIsRecovering(): boolean {
  return useSessionStore((state) => state.isRecovering);
}

export function useIsPendingDeletion(): boolean {
  return useSessionStore((state) => state.isPendingDeletion);
}

export function useAccountPurgeAfter(): Date | null {
  return useSessionStore((state) => state.purgeAfter);
}

export function useFinishPasswordRecovery(): () => void {
  return finishPasswordRecovery;
}

export function useSetSession(): (user: User) => void {
  return setSessionUser;
}

export function useClearSession(): () => Promise<void> {
  return signOut;
}
