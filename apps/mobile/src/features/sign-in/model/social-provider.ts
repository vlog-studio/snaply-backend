import type { SocialProvider } from '@/entities/session';
import { KAKAO_SIGN_IN_ENABLED } from '@/shared/config/auth';

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
 * Brand-styled metadata for the Kakao provider, fixed by Kakao's login design
 * guide: container #FEE500, black symbol, label black at 85% opacity, and the
 * label text 카카오 로그인 (카카오로 시작하기 is reserved for Kakao Sync).
 */
const kakaoProvider: SocialProviderMeta = {
  id: 'kakao',
  label: '카카오 로그인',
  backgroundColor: '#FEE500',
  textColor: 'rgba(0, 0, 0, 0.85)',
  borderColor: '#FEE500',
};

/**
 * The providers to offer, in order. Kakao leads — it is the sign-in most Korean
 * users already hold — and is only listed where its console setup is done
 * (`KAKAO_SIGN_IN_ENABLED`). Both buttons share one size, so neither brand's
 * rule against a less prominent button is broken. Apple is deferred (owner
 * decision, 2026-09-24): the only store account is Google Play.
 */
export function offeredSocialProviders(kakaoEnabled: boolean): SocialProviderMeta[] {
  return kakaoEnabled ? [kakaoProvider, googleProvider] : [googleProvider];
}

/** Providers actually offered on the sign-in screen, in order. */
export const socialProviders: SocialProviderMeta[] = offeredSocialProviders(KAKAO_SIGN_IN_ENABLED);
