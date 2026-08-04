/**
 * 개발 진단용: 릴스 게시 엔드포인트가 어느 형태로 유효한지 확인한다.
 *
 * video_url 을 일부러 잘못된 값으로 주고, 에러가
 *   - "Unsupported post request ..." → 그 경로 자체가 유효하지 않음
 *   - video_url/미디어 관련 에러      → 경로는 유효, 우리 입력만 문제
 * 로 갈리는 것을 이용한다. 실제 컨테이너를 만들지 않으므로 안전하다.
 *
 * 사용: npm run ig:publish-probe -w apps/api
 */
import { PrismaClient } from '@prisma/client';
import { initCrypto, decrypt } from '../src/lib/crypto.js';

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

// /me 로 정확한 식별자들을 먼저 확보 (문자열로 오므로 정밀도 문제 없음)
const meRes = await fetch(
  `https://graph.instagram.com/${version}/me?fields=user_id,username,account_type&access_token=${token}`,
);
const me = (await meRes.json()) as { user_id?: string; id?: string; username?: string };
console.log('me =', JSON.stringify(me), '\n');

const targets = [
  { label: '/me/media', path: 'me' },
  { label: `/{user_id}/media  (${me.user_id})`, path: me.user_id ?? '' },
  { label: `/{id}/media  (${me.id})`, path: me.id ?? '' },
  { label: `/{저장된 platformUserId}/media  (${conn.platformUserId})`, path: conn.platformUserId ?? '' },
];

for (const t of targets) {
  if (!t.path) {
    console.log(`⏭  ${t.label} — 값 없음`);
    continue;
  }
  const res = await fetch(`https://graph.instagram.com/${version}/${t.path}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: 'https://example.invalid/definitely-not-a-video.mp4',
      caption: '(probe)',
      access_token: token,
    }),
  });
  const raw = (await res.text()).replaceAll(token, '<TOKEN>');
  const unsupported = /Unsupported (post|get) request/.test(raw);
  const mark = unsupported ? '❌ 경로 무효' : '✅ 경로 유효';
  console.log(`${mark}  ${t.label.padEnd(52)} ${res.status}  ${raw.slice(0, 150)}`);
}

await prisma.$disconnect();
