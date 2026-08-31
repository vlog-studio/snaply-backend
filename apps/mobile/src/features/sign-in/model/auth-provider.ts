import type { SocialProvider, User } from '@/entities/session';

/**
 * The authentication mechanism the sign-in action depends on. Keeping the
 * action behind this interface lets the mock implementation be swapped for a
 * real BaaS or backend client (see `docs/features/authentication.md`) without
 * touching screens, routing, or the session store.
 */
export interface AuthProvider {
  signIn(provider: SocialProvider): Promise<User>;
}
