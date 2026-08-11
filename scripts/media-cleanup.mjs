#!/usr/bin/env node
/**
 * 미디어 트랙 테스트 데이터 정리 (개발용).
 *
 * 공유 Supabase를 쓰기 때문에 통합 테스트 후 자기 데이터를 지워야 한다(docs/team.md §4).
 * (플랜별 편집 횟수 제한이 재도입되면 한도 초기화 용도로도 쓴다 — docs/plan-limits.md)
 *
 * 사용법:
 *   node scripts/media-cleanup.mjs                     # 대상만 보여주고 종료(기본: dry-run)
 *   node scripts/media-cleanup.mjs --yes               # 실제 삭제
 *   node scripts/media-cleanup.mjs --jobs-only --yes   # edit_jobs만 (영상은 남김)
 *
 * 대상 유저는 TEST_EMAIL 환경변수의 계정 하나로 한정한다. 다른 사람 데이터는 건드리지 않는다.
 */
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const apply = args.includes('--yes');
const jobsOnly = args.includes('--jobs-only');

const email = process.env.TEST_EMAIL;
if (!email) {
  console.error('TEST_EMAIL 환경변수가 필요합니다. (그 계정의 데이터만 지웁니다)');
  process.exit(1);
}

// apps/api/.env 로드 (기존 환경변수를 덮지 않는다)
const raw = await readFile(new URL('../apps/api/.env', import.meta.url), 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (/^["']/.test(v)) v = v.slice(1, v.lastIndexOf(v[0]));
  else v = v.replace(/\s+#.*$/, '').trim();
  process.env[m[1]] = v;
}

// 이메일 → Supabase UID (users 테이블에는 email이 없고 supabase_uid로 연결된다)
async function findSupabaseUid() {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/admin/users?per_page=100`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) {
    console.error(`Supabase admin API 실패 (${res.status})`);
    process.exit(1);
  }
  const body = await res.json();
  const users = body.users ?? body;
  return users.find((u) => u.email === email)?.id ?? null;
}

const supabaseUid = await findSupabaseUid();
if (!supabaseUid) {
  console.error(`Supabase에서 유저를 찾을 수 없습니다: ${email}`);
  process.exit(1);
}

// prisma client는 모노레포 루트로 호이스팅되어 있다
const { PrismaClient } = await import(
  new URL('../node_modules/@prisma/client/default.js', import.meta.url).href
);
const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { supabaseUid },
    select: { id: true, nickname: true },
  });
  if (!user) {
    console.log(`${email} 은 아직 API를 호출한 적이 없습니다(users 레코드 없음). 지울 것 없음.`);
    process.exit(0);
  }

  const jobs = await prisma.editJob.count({ where: { userId: user.id } });
  const videos = await prisma.video.count({ where: { userId: user.id } });

  console.log(`대상 유저: ${email} (${user.id})`);
  console.log(`  edit_jobs : ${jobs}건`);
  console.log(`  videos    : ${videos}건${jobsOnly ? ' (--jobs-only, 유지)' : ''}`);

  if (!apply) {
    console.log('\ndry-run입니다. 실제로 지우려면 --yes 를 붙이세요.');
    console.log('※ S3 객체는 지우지 않습니다. 원본까지 지우려면 DELETE /videos/{id} 를 쓰세요.');
    process.exit(0);
  }

  const delJobs = await prisma.editJob.deleteMany({ where: { userId: user.id } });
  console.log(`\nedit_jobs ${delJobs.count}건 삭제`);

  if (!jobsOnly) {
    const delVideos = await prisma.video.deleteMany({ where: { userId: user.id } });
    console.log(`videos ${delVideos.count}건 삭제 (S3 객체는 남아 있음)`);
  }
  console.log('완료.');
} finally {
  await prisma.$disconnect();
}
