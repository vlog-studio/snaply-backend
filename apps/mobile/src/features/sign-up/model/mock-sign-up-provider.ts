import type { SignUpProvider } from './sign-up-provider';

const SIMULATED_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Offline stand-in for dev builds without Supabase credentials. It never sends
 * an email, so the deep-link confirmation cannot actually complete offline; it
 * exists only to keep the sign-up screen from dead-ending during development.
 */
export const mockSignUpProvider: SignUpProvider = {
  async signUp() {
    await delay(SIMULATED_LATENCY_MS);
    return { needsConfirmation: true };
  },

  async resend() {
    await delay(SIMULATED_LATENCY_MS);
  },
};
