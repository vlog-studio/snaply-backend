import type { User as SupabaseUser } from '@supabase/supabase-js';

import type { AuthMethod, User } from '../model/user';

function toAuthMethod(value: unknown): AuthMethod {
  if (value === 'apple') return 'apple';
  if (value === 'email') return 'email';
  return 'google';
}

function firstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return undefined;
}

/**
 * Derive the app's `User` from a Supabase auth user. Supabase owns the session
 * and tokens; this maps only the identity fields the app renders. `provider`
 * comes from `app_metadata.provider`; the display name and avatar fall back
 * across the differently-named fields Google and Apple populate.
 */
export function mapSupabaseUser(supabaseUser: SupabaseUser): User {
  const metadata = supabaseUser.user_metadata ?? {};
  return {
    id: supabaseUser.id,
    provider: toAuthMethod(supabaseUser.app_metadata?.provider),
    displayName: firstString(metadata.full_name, metadata.name, supabaseUser.email) ?? '사용자',
    avatarUrl: firstString(metadata.avatar_url, metadata.picture),
  };
}
