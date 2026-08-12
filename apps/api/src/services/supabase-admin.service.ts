/**
 * Supabase Auth Admin API 클라이언트 (service role key 필요).
 *
 * 계정 실삭제(purge)에서 auth.users 를 지울 때만 사용한다. 앱 유저 행만 지우면
 * 유효한 JWT 로 다음 요청이 오는 순간 resolveUser 의 upsert 가 유저를 재생성하므로,
 * 삭제를 완결하려면 Supabase 쪽 계정까지 지워야 한다.
 */

interface SupabaseAdminConfig {
  url: string;
  serviceRoleKey: string | undefined;
}

let cfg: SupabaseAdminConfig | null = null;

export function initSupabaseAdmin(config: SupabaseAdminConfig): void {
  cfg = config;
}

/** auth.users 에서 계정을 삭제한다. 이미 없으면(404) 성공으로 간주한다. */
export async function deleteAuthUser(supabaseUid: string): Promise<void> {
  if (!cfg) {
    throw new Error('supabase-admin이 초기화되지 않았습니다. initSupabaseAdmin()을 먼저 호출하세요.');
  }
  if (!cfg.serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY가 없어 Supabase 계정을 삭제할 수 없습니다.');
  }
  const res = await fetch(`${cfg.url}/auth/v1/admin/users/${supabaseUid}`, {
    method: 'DELETE',
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Supabase 계정 삭제 실패 (${res.status}): ${supabaseUid}`);
  }
}
