/**
 * 개발 진단용: DB에 저장된 인스타그램 access_token 으로 어느 엔드포인트/메서드가 실제로 동작하는지 확인한다.
 *
 * 배경: `graph.instagram.com` 이 유효한 Instagram Login 토큰에 대해
 * `IGApiException 100: Unsupported request - method type: get` 를 반환하는 경우가 있다.
 * 가짜 토큰으로는 인증(190)이 먼저 걸려 라우팅 유효성을 판별할 수 없어, 실토큰으로만 판별된다.
 *
 * 사용: npm run ig:probe -w apps/api
 * 주의: 토큰 값은 출력하지 않는다.
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
  console.error('저장된 인스타그램 연동이 없습니다. 먼저 OAuth 를 완료하세요.');
  await prisma.$disconnect();
  process.exit(1);
}

const token = decrypt(conn.accessToken);
const igUserId = conn.platformUserId ?? '';
const secret = process.env.INSTAGRAM_APP_SECRET ?? '';
console.log(`연동 정보: platformUserId=${igUserId} username=${conn.platformUsername ?? '(없음)'}`);
console.log(`토큰 길이=${token.length}자, 만료=${conn.tokenExpiresAt?.toISOString() ?? '(미설정)'}\n`);

interface Case {
  label: string;
  url: string;
  method?: 'GET' | 'POST';
  form?: Record<string, string>;
}

const cases: Case[] = [
  // 프로필 조회 — 호스트/버전/메서드 조합
  { label: 'GET  graph.instagram.com/v23.0/me', url: 'https://graph.instagram.com/v23.0/me?fields=user_id,username,account_type' },
  { label: 'GET  graph.instagram.com/me', url: 'https://graph.instagram.com/me?fields=user_id,username,account_type' },
  { label: 'POST graph.instagram.com/v23.0/me', url: 'https://graph.instagram.com/v23.0/me', method: 'POST', form: { fields: 'user_id,username,account_type' } },
  { label: 'GET  graph.facebook.com/v23.0/me', url: 'https://graph.facebook.com/v23.0/me?fields=id,name' },
  { label: `GET  graph.instagram.com/v23.0/${igUserId}`, url: `https://graph.instagram.com/v23.0/${igUserId}?fields=user_id,username,account_type` },
  // 토큰 점검
  { label: 'GET  graph.instagram.com/debug_token', url: `https://graph.instagram.com/debug_token?input_token=TOKEN` },
  // 장기 토큰 교환 — 메서드 변형
  { label: 'GET  /access_token (ig_exchange_token)', url: `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${secret}` },
  { label: 'POST /access_token (ig_exchange_token)', url: 'https://graph.instagram.com/access_token', method: 'POST', form: { grant_type: 'ig_exchange_token', client_secret: secret } },
  { label: 'GET  /refresh_access_token', url: 'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token' },
  { label: 'POST /refresh_access_token', url: 'https://graph.instagram.com/refresh_access_token', method: 'POST', form: { grant_type: 'ig_refresh_token' } },
];

for (const c of cases) {
  const method = c.method ?? 'GET';
  let res: Response;
  try {
    if (method === 'POST') {
      const body = new URLSearchParams({ ...(c.form ?? {}), access_token: token });
      res = await fetch(c.url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } else {
      const url = new URL(c.url.replace('input_token=TOKEN', `input_token=${token}`));
      url.searchParams.set('access_token', token);
      res = await fetch(url);
    }
    const raw = await res.text();
    // 토큰이 응답에 섞여 나올 수 있으니 마스킹
    const safe = raw.replaceAll(token, '<TOKEN>').slice(0, 180);
    console.log(`${res.ok ? '✅' : '❌'} ${c.label.padEnd(46)} ${res.status}  ${safe}`);
  } catch (err) {
    console.log(`💥 ${c.label.padEnd(46)} ${(err as Error).message}`);
  }
}

await prisma.$disconnect();
