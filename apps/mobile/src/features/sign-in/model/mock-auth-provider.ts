import type { SocialProvider, User } from '@/entities/session';

import type { AuthProvider } from './auth-provider';

const MOCK_DISPLAY_NAMES: Record<SocialProvider, string> = {
  google: 'Google 사용자',
  apple: 'Apple 사용자',
};

const SIMULATED_LATENCY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulated provider for the pre-backend phase. It performs no real OAuth or
 * token exchange; it returns a deterministic local user after a short delay so
 * the full session, persistence, and routing flow can be exercised on device.
 */
export const mockAuthProvider: AuthProvider = {
  async signIn(provider) {
    await delay(SIMULATED_LATENCY_MS);
    const user: User = {
      id: `mock-${provider}`,
      displayName: MOCK_DISPLAY_NAMES[provider],
      provider,
    };
    return user;
  },
};
