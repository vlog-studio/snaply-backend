/**
 * 계정 실삭제 배치 — 삭제 유예 기간(30일)이 지난 계정을 영구 삭제한다.
 *
 * 계정별로 S3 prefix → Supabase Auth → DB(users 행, Cascade) 순서로 지운다.
 * SUPABASE_SERVICE_ROLE_KEY 가 필요하다 (없으면 전부 실패로 기록된다).
 *
 * 사용법:
 *   npm run accounts:purge -w apps/api            # 대상만 보여주고 종료 (dry-run)
 *   npm run accounts:purge -w apps/api -- --yes   # 실제 삭제
 *
 * 운영에서는 스케줄러(cron)로 하루 1회 실행을 상정한다 — docs/decisions/account-deletion.md
 */
import { loadConfig } from '../src/config.js';
import { initStorage } from '../src/services/storage.service.js';
import { initSupabaseAdmin } from '../src/services/supabase-admin.service.js';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  findPurgeCandidates,
  purgeExpiredAccounts,
} from '../src/services/account.service.js';
import { disconnectPrisma } from '../src/db/client.js';

const apply = process.argv.includes('--yes');

const config = loadConfig();
initStorage(config.storage);
initSupabaseAdmin({ url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey });

try {
  const candidates = await findPurgeCandidates();
  console.log(`유예 기간(${ACCOUNT_DELETION_GRACE_DAYS}일) 만료 계정: ${candidates.length}건`);
  for (const c of candidates) {
    console.log(`  ${c.id} (삭제 요청: ${c.deletedAt.toISOString()})`);
  }

  if (candidates.length === 0) {
    process.exit(0);
  }
  if (!apply) {
    console.log('\ndry-run입니다. 실제로 지우려면 --yes 를 붙이세요.');
    process.exit(0);
  }

  const result = await purgeExpiredAccounts();
  console.log(`\n실삭제 완료: ${result.purged.length}건, 실패: ${result.failed.length}건`);
  if (result.failed.length > 0) {
    console.error(`실패한 계정(다음 실행에서 재시도됨): ${result.failed.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await disconnectPrisma();
}
