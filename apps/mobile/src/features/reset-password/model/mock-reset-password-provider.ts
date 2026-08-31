import type { ResetPasswordProvider } from './reset-password-provider';

const SIMULATED_LATENCY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Offline stand-in for dev builds without Supabase credentials. It never sends
 * an email, so the deep-link recovery cannot actually complete offline.
 */
export const mockResetPasswordProvider: ResetPasswordProvider = {
  async requestReset() {
    await delay(SIMULATED_LATENCY_MS);
  },

  async updatePassword() {
    await delay(SIMULATED_LATENCY_MS);
  },
};
