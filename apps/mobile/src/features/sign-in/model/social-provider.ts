import type { SocialProvider } from '@/entities/session';

/** Presentation metadata for a social sign-in button. */
export type SocialProviderMeta = {
  id: SocialProvider;
  label: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
};

/** Brand-styled metadata for the Google provider. */
const googleProvider: SocialProviderMeta = {
  id: 'google',
  label: 'Google로 시작하기',
  backgroundColor: '#FFFFFF',
  textColor: '#1F1F1F',
  borderColor: '#DADCE0',
};

/**
 * Providers actually offered on the sign-in screen, in order. Only Google is
 * enabled in the Supabase project today. Apple is the expected next one —
 * offering social login on iOS requires it for App Store review — and lands as
 * another `SocialProviderMeta` in this array once it is configured.
 */
export const socialProviders: SocialProviderMeta[] = [googleProvider];
