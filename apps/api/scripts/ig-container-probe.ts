/**
 * 개발 진단용: 릴스 **컨테이너 생성 + 처리 완료까지만** 확인한다. 게시(media_publish)는 하지 않는다.
 *
 * 이걸로 검증되는 것:
 *  - Meta 가 우리 video_url 을 실제로 내려받을 수 있는지 (터널 + 공개 버킷)
 *  - 영상이 릴스 규격을 통과하는지
 *  - status_code 폴링 로직이 실제 API 와 맞는지
 *
 * 게시는 계정에 공개로 올라가므로 이 스크립트는 절대 하지 않는다.
 *
 * 사용: npm run ig:container-probe -w apps/api -- <video_url>
 */
import { PrismaClient } from '@prisma/client';
import { initCrypto, decrypt } from '../src/lib/crypto.js';

const videoUrl = process.argv[2];
if (!videoUrl) {
  console.error('사용법: npm run ig:container-probe -w apps/api -- <video_url>');
  process.exit(1);
}

const prisma = new PrismaClient();
initCrypto(process.env.SNS_TOKEN_ENCRYPTION_KEY ?? 'dev-insecure-sns-key');

const conn = await prisma.snsConnection.findFirst({
  where: { platform: 'instagram' },
  orderBy: { createdAt: 'desc' },
});
if (!conn?.accessToken) {
  console.error('저장된 인스타그램 연동이 없습니다.');
  await prisma.$disconnect();
  process.exit(1);
}
const token = decrypt(conn.accessToken);
const version = process.env.INSTAGRAM_GRAPH_VERSION ?? 'v23.0';
const base = `https://graph.instagram.com/${version}`;

console.log(`video_url = ${videoUrl}\n`);

// 1) 컨테이너 생성
const createRes = await fetch(`${base}/me/media`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    media_type: 'REELS',
    video_url: videoUrl,
    caption: '(검증용 — 게시하지 않습니다)',
    access_token: token,
  }),
});
const createRaw = (await createRes.text()).replaceAll(token, '<TOKEN>');
console.log(`1) 컨테이너 생성: ${createRes.status} ${createRaw.slice(0, 200)}`);
if (!createRes.ok) {
  await prisma.$disconnect();
  process.exit(1);
}
const creationId = (JSON.parse(createRaw) as { id: string }).id;

// 2) 처리 완료까지 폴링 (게시는 하지 않음)
const deadline = Date.now() + 5 * 60_000;
let attempt = 0;
while (Date.now() < deadline) {
  attempt += 1;
  const url = new URL(`${base}/${creationId}`);
  url.searchParams.set('fields', 'status_code,status');
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const raw = (await res.text()).replaceAll(token, '<TOKEN>');
  const body = JSON.parse(raw) as { status_code?: string; status?: string };
  console.log(`   폴링 ${attempt}: ${res.status} status_code=${body.status_code ?? '?'} ${body.status ?? ''}`);

  if (body.status_code === 'FINISHED') {
    console.log('\n✅ 컨테이너 처리 완료 — 이 상태면 media_publish 로 게시 가능합니다.');
    console.log(`   creation_id = ${creationId}`);
    console.log('   (게시는 하지 않았습니다. 컨테이너는 24시간 뒤 자동 만료됩니다.)');
    break;
  }
  if (body.status_code === 'ERROR' || body.status_code === 'EXPIRED') {
    console.log(`\n❌ 처리 실패: ${body.status_code} — ${body.status ?? ''}`);
    break;
  }
  await new Promise((r) => setTimeout(r, 5000));
}

await prisma.$disconnect();
