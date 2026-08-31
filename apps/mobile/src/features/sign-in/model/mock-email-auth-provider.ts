import type { User } from '@/entities/session';

import type { EmailAuthProvider } from './email-auth-provider';

const SIMULATED_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Offline stand-in for the pre-configuration phase (dev builds without Supabase
 * credentials). It performs no real authentication; it returns a deterministic
 * local user after a short delay so the session/routing flow works on device.
 */
export const mockEmailAuthProvider: EmailAuthProvider = {
  async signIn(email) {
    await delay(SIMULATED_LATENCY_MS);
    const user: User = {
      id: `mock-email-${email}`,
      displayName: email,
      provider: 'email',
    };
    return user;
  },
};
