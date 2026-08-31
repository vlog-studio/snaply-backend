import { makeRedirectUri } from 'expo-auth-session';

// Deep links Supabase redirects back to. Both must be registered in the Supabase
// dashboard's Redirect URL allowlist. Distinct paths let the deep-link handler
// tell a sign-up confirmation apart from a password recovery without relying on
// the auth event, which is not emitted consistently for a manual code exchange.
//
// Computed lazily (and memoized) rather than at module load: `makeRedirectUri`
// touches native scheme resolution, which throws under Jest, and these are only
// needed at request time from a provider.
let callbackUrl: string | undefined;
let resetUrl: string | undefined;

export function getAuthCallbackUrl(): string {
  return (callbackUrl ??= makeRedirectUri({ scheme: 'snaplyapp', path: 'auth/callback' }));
}

export function getPasswordResetUrl(): string {
  return (resetUrl ??= makeRedirectUri({ scheme: 'snaplyapp', path: 'auth/reset' }));
}
