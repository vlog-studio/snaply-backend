/**
 * Sign-in provider switches.
 *
 * Kakao sign-in needs console work outside the app — a Kakao Developers app
 * with the `account_email` consent item (Supabase always requests it) and the
 * Kakao provider enabled in the Supabase project — so its button is offered
 * only in builds that set `EXPO_PUBLIC_KAKAO_SIGN_IN_ENABLED=true`. Until then
 * a pressed button would only ever answer "provider is not enabled".
 */
export const KAKAO_SIGN_IN_ENABLED = process.env.EXPO_PUBLIC_KAKAO_SIGN_IN_ENABLED === 'true';
