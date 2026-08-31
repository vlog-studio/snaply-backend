import { supabase } from '@/shared/lib/supabase';

/**
 * The current Supabase JWT as an `Authorization` header, or nothing when there
 * is no session.
 *
 * The backend verifies this token against Supabase's JWKS, so every protected
 * endpoint — HTTP and WebSocket alike — authorizes the caller with it. Shared by
 * `apiRequest` and `openApiSocket` rather than duplicated: both transports carry
 * the same credential, and the token is read per request so a refreshed session
 * is picked up without anything having to be re-created.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
