/**
 * 보상형 광고 크레딧.
 *
 * 실제 AdMob 없이도 검증의 전부(서명·세션·한도·중복·킬 스위치)를 돌린다. 테스트용 EC 키를
 * 만들어 로컬 키셋 파일을 `ADMOB_VERIFIER_KEYS_URL` 로 물리므로, 서명 검증 경로는 운영과
 * 같은 코드가 실행된다 — 검증을 우회하는 mock 플래그를 두지 않는다.
 *
 * 지급의 유일한 트리거가 SSV 콜백이라는 계약을 이 파일이 지킨다: 아래 어떤 테스트도
 * "앱이 지급을 요청" 하지 않는다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { resetVerifierKeyCache } from '../src/services/billing/admob-ssv.js';

let h: Harness;

const AD_UNIT = 'ca-app-pub-0000000000000000/1111111111';
const REWARD_CREDITS = 20;
const DAILY_LIMIT = 3;
const KEY_ID = '3335741209';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

/** 다른 키로 서명하면 위조가 된다 — 서명 검증이 실제로 도는지 확인하는 데 쓴다. */
const foreignKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;

function writeKeySet(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snaply-admob-keys-'));
  const path = join(dir, 'verifier-keys.json');
  writeFileSync(
    path,
    JSON.stringify({
      keys: [
        {
          keyId: Number(KEY_ID),
          pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          base64: '',
        },
      ],
    }),
  );
  return pathToFileURL(path).href;
}

beforeAll(async () => {
  resetVerifierKeyCache();
  h = await createHarness({
    AD_REWARD_ENABLED: 'true',
    AD_REWARD_CREDITS: String(REWARD_CREDITS),
    AD_REWARD_DAILY_LIMIT: String(DAILY_LIMIT),
    // 쿨다운은 개별 테스트에서만 켠다. 기본값(300초)을 켜 두면 한도 테스트가 기다려야 한다.
    AD_REWARD_COOLDOWN_SECONDS: '0',
    ADMOB_SSV_ALLOWED_AD_UNITS: AD_UNIT,
    ADMOB_VERIFIER_KEYS_URL: writeKeySet(),
  });
});
afterAll(async () => {
  await h.close();
  resetVerifierKeyCache();
});
beforeEach(async () => {
  await h.resetDb();
});

// ── SSV 콜백 만들기 ─────────────────────────────────────

interface SsvOptions {
  nonce: string;
  userId: string;
  adUnit?: string;
  transactionId?: string;
  timestampMs?: number;
  /** true 면 우리 키가 아닌 키로 서명한다 (위조). */
  forge?: boolean;
}

/**
 * 실제 AdMob 콜백과 같은 모양의 쿼리스트링을 만든다.
 * 서명 대상은 `&signature=` **직전까지의 원문**이므로, 여기서도 조립한 문자열을 그대로 서명한다.
 */
function ssvUrl(options: SsvOptions): string {
  const params: [string, string][] = [
    ['ad_network', '5450213213286189855'],
    ['ad_unit', options.adUnit ?? AD_UNIT],
    ['custom_data', options.nonce],
    // 서버는 이 값을 무시한다 — 지급량의 원천은 세션에 스냅샷된 정책값이다.
    ['reward_amount', '1'],
    ['reward_item', 'credit'],
    ['timestamp', String(options.timestampMs ?? Date.now())],
    ['transaction_id', options.transactionId ?? randomUUID().replace(/-/g, '')],
    ['user_id', options.userId],
  ];
  const content = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const signature = createSign('SHA256')
    .update(content)
    .sign(options.forge ? foreignKey : privateKey)
    .toString('base64url');
  return `/billing/webhook/admob?${content}&signature=${signature}&key_id=${KEY_ID}`;
}

function callSsv(options: SsvOptions) {
  return h.app.inject({ method: 'GET', url: ssvUrl(options) });
}

// ── 헬퍼 ────────────────────────────────────────────────

async function availability(user: TestUser) {
  const res = await h.app.inject({
    method: 'GET',
    url: '/billing/ad-rewards',
    headers: user.auth,
  });
  expect(res.statusCode).toBe(200);
  return res.json().data;
}

function openSession(user: TestUser) {
  return h.app.inject({ method: 'POST', url: '/billing/ad-rewards', headers: user.auth });
}

/** 세션 발급 → 정상 SSV → 지급까지 한 번에. 반환값은 rewardId. */
async function watchAd(user: TestUser, transactionId?: string): Promise<string> {
  const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };
  const res = await callSsv({ nonce: session.nonce, userId: user.id, transactionId });
  expect(res.statusCode).toBe(200);
  return session.rewardId;
}

async function balanceOf(user: TestUser): Promise<number> {
  const res = await h.app.inject({ method: 'GET', url: '/billing/credits', headers: user.auth });
  expect(res.statusCode).toBe(200);
  return res.json().data.balance as number;
}

/** 쿨다운·킬 스위치처럼 정책 env 를 잠깐만 바꿔야 하는 테스트용. */
async function withEnv(overrides: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('GET /billing/ad-rewards', () => {
  it('정책값과 남은 횟수를 준다 (앱은 이 값만 보고 버튼을 그린다)', async () => {
    const user = await h.createUser();

    expect(await availability(user)).toMatchObject({
      enabled: true,
      rewardCredits: REWARD_CREDITS,
      dailyLimit: DAILY_LIMIT,
      remainingToday: DAILY_LIMIT,
      nextAvailableAt: null,
    });
  });

  it('지급될 때마다 remainingToday 가 줄어든다', async () => {
    const user = await h.createUser();
    await watchAd(user);

    expect((await availability(user)).remainingToday).toBe(DAILY_LIMIT - 1);
  });

  it('쿨다운 중이면 nextAvailableAt 이 채워진다', async () => {
    const user = await h.createUser();
    await watchAd(user);

    await withEnv({ AD_REWARD_COOLDOWN_SECONDS: '300' }, async () => {
      const data = await availability(user);
      expect(data.nextAvailableAt).not.toBeNull();
      expect(new Date(data.nextAvailableAt as string).getTime()).toBeGreaterThan(Date.now());
    });
  });

  it('킬 스위치가 꺼져 있으면 enabled: false 이고 세션 발급은 503', async () => {
    const user = await h.createUser();

    await withEnv({ AD_REWARD_ENABLED: 'false' }, async () => {
      expect((await availability(user)).enabled).toBe(false);

      const res = await openSession(user);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('AD_REWARDS_DISABLED');
    });
  });

  it('인증이 없으면 401', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/billing/ad-rewards' })).statusCode).toBe(401);
  });
});

describe('POST /billing/ad-rewards', () => {
  it('세션을 발급하고 SSV 왕복에 필요한 값을 준다', async () => {
    const user = await h.createUser();
    const res = await openSession(user);

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ ssvUserId: user.id, rewardCredits: REWARD_CREDITS });
    expect(data.nonce).toEqual(expect.any(String));
    // 폴링 경로에 SSV 비밀이 노출되지 않도록 두 식별자는 서로 다른 값이어야 한다.
    expect(data.rewardId).not.toBe(data.nonce);
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('아직 pending 인 세션이 있으면 409 AD_REWARD_SESSION_ACTIVE', async () => {
    const user = await h.createUser();
    const first = (await openSession(user)).json().data.rewardId as string;

    const res = await openSession(user);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'AD_REWARD_SESSION_ACTIVE',
      rewardId: first,
    });
  });

  it('만료된 pending 세션은 발급을 막지 않는다', async () => {
    const user = await h.createUser();
    const rewardId = (await openSession(user)).json().data.rewardId as string;
    await h.prisma.adReward.update({
      where: { id: rewardId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await openSession(user)).statusCode).toBe(200);
    // 배치 없이 조회 시점에 확정된다.
    expect((await h.prisma.adReward.findUnique({ where: { id: rewardId } }))?.status).toBe(
      'expired',
    );
  });

  it('일일 한도를 소진하면 409 AD_REWARD_LIMIT_REACHED', async () => {
    const user = await h.createUser();
    for (let i = 0; i < DAILY_LIMIT; i += 1) {
      await watchAd(user);
    }

    const res = await openSession(user);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('AD_REWARD_LIMIT_REACHED');
    // 앱이 "언제 다시 가능한지" 를 그릴 수 있게 초기화 시각을 함께 내린다.
    expect(new Date(res.json().error.resetsAt).getTime()).toBeGreaterThan(Date.now());
    expect(await balanceOf(user)).toBe(REWARD_CREDITS * DAILY_LIMIT);
  });

  it('쿨다운 중이면 409 AD_REWARD_COOLDOWN', async () => {
    const user = await h.createUser();
    await watchAd(user);

    await withEnv({ AD_REWARD_COOLDOWN_SECONDS: '300' }, async () => {
      const res = await openSession(user);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('AD_REWARD_COOLDOWN');
      expect(new Date(res.json().error.nextAvailableAt).getTime()).toBeGreaterThan(Date.now());
    });
  });
});

describe('GET /billing/webhook/admob (SSV)', () => {
  it('정상 콜백으로 크레딧을 지급한다', async () => {
    const user = await h.createUser();
    const rewardId = await watchAd(user);

    expect(await balanceOf(user)).toBe(REWARD_CREDITS);
    const reward = await h.prisma.adReward.findUnique({ where: { id: rewardId } });
    expect(reward).toMatchObject({ status: 'granted', adUnit: AD_UNIT, credits: REWARD_CREDITS });
    expect(reward?.grantedAt).not.toBeNull();

    const entry = await h.prisma.creditLedger.findFirst({ where: { adRewardId: rewardId } });
    expect(entry).toMatchObject({ delta: REWARD_CREDITS, reason: 'ad_reward' });
  });

  it('같은 transaction_id 가 재전송돼도 지급은 한 번뿐이고 200 이다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { nonce: string };
    const transactionId = `txn_${randomUUID().replace(/-/g, '')}`;

    const first = await callSsv({ nonce: session.nonce, userId: user.id, transactionId });
    const second = await callSsv({ nonce: session.nonce, userId: user.id, transactionId });

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(await balanceOf(user)).toBe(REWARD_CREDITS);
    expect(await h.prisma.creditLedger.count({ where: { reason: 'ad_reward' } })).toBe(1);
  });

  it('위조 서명은 지급하지 않고 rejected 로 남긴다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };

    const res = await callSsv({ nonce: session.nonce, userId: user.id, forge: true });

    // 200 으로 삼키면 위조 시도와 정상 미지급이 로그에서 구분되지 않는다.
    expect(res.statusCode).toBe(400);
    expect(await balanceOf(user)).toBe(0);
    expect(await h.prisma.adReward.findUnique({ where: { id: session.rewardId } })).toMatchObject({
      status: 'rejected',
      rejectReason: 'invalid_signature',
    });
  });

  it('만료된 세션에는 지급하지 않는다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };
    await h.prisma.adReward.update({
      where: { id: session.rewardId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await callSsv({ nonce: session.nonce, userId: user.id });

    expect(res.statusCode).toBe(400);
    expect(await balanceOf(user)).toBe(0);
    expect(
      (await h.prisma.adReward.findUnique({ where: { id: session.rewardId } }))?.rejectReason,
    ).toBe('session_expired');
  });

  it('남의 user_id 로 온 콜백은 지급하지 않는다', async () => {
    const [owner, attacker] = [await h.createUser(), await h.createUser()];
    const session = (await openSession(owner)).json().data as { rewardId: string; nonce: string };

    const res = await callSsv({ nonce: session.nonce, userId: attacker.id });

    expect(res.statusCode).toBe(400);
    expect(await balanceOf(owner)).toBe(0);
    expect(await balanceOf(attacker)).toBe(0);
    expect(
      (await h.prisma.adReward.findUnique({ where: { id: session.rewardId } }))?.rejectReason,
    ).toBe('user_mismatch');
  });

  it('허용 목록에 없는 광고 단위는 지급하지 않고, 수신한 값을 진단용으로 남긴다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };
    const wrongUnit = 'ca-app-pub-9999999999999999/9999999999';

    const res = await callSsv({ nonce: session.nonce, userId: user.id, adUnit: wrongUnit });

    expect(res.statusCode).toBe(400);
    expect(await balanceOf(user)).toBe(0);
    // 수신값을 남기지 않으면 허용 목록의 형식 문제(전체 ID vs 숫자 부분)를 DB 만 보고
    // 진단할 수 없다 — backlog C-6 의 첫 설정에서 실제로 필요하다.
    expect(await h.prisma.adReward.findUnique({ where: { id: session.rewardId } })).toMatchObject({
      rejectReason: 'ad_unit_not_allowed',
      adUnit: wrongUnit,
    });
  });

  it('허용 오차를 벗어난 timestamp 는 지급하지 않는다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };

    const res = await callSsv({
      nonce: session.nonce,
      userId: user.id,
      timestampMs: Date.now() - 60 * 60_000,
    });

    expect(res.statusCode).toBe(400);
    expect(
      (await h.prisma.adReward.findUnique({ where: { id: session.rewardId } }))?.rejectReason,
    ).toBe('stale_timestamp');
  });

  it('발급한 적 없는 세션은 400 이고 아무 것도 남기지 않는다', async () => {
    const user = await h.createUser();

    const res = await callSsv({ nonce: 'nonce-we-never-issued', userId: user.id });

    expect(res.statusCode).toBe(400);
    expect(await h.prisma.adReward.count()).toBe(0);
  });

  it('일일 한도를 넘긴 지급은 세션이 남아 있어도 거절한다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };
    // 세션 발급 이후 한도가 소진된 상황 — 한도는 지급 시점에 다시 센다.
    await h.prisma.adReward.createMany({
      data: Array.from({ length: DAILY_LIMIT }, () => ({
        userId: user.id,
        nonce: randomUUID(),
        status: 'granted',
        credits: REWARD_CREDITS,
        expiresAt: new Date(),
        grantedAt: new Date(),
      })),
    });

    const res = await callSsv({ nonce: session.nonce, userId: user.id });

    expect(res.statusCode).toBe(400);
    expect(await h.prisma.creditLedger.count({ where: { reason: 'ad_reward' } })).toBe(0);
    expect(
      (await h.prisma.adReward.findUnique({ where: { id: session.rewardId } }))?.rejectReason,
    ).toBe('daily_limit');
  });

  it('삭제 대기 계정에는 지급하지 않는다', async () => {
    const user = await h.createUser();
    const session = (await openSession(user)).json().data as { rewardId: string; nonce: string };
    await h.prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await callSsv({ nonce: session.nonce, userId: user.id });

    expect(res.statusCode).toBe(400);
    expect(
      (await h.prisma.adReward.findUnique({ where: { id: session.rewardId } }))?.rejectReason,
    ).toBe('account_unavailable');
  });

  it('쿼리스트링이 없으면 400', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/billing/webhook/admob' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /billing/ad-rewards/:rewardId', () => {
  function status(user: TestUser, rewardId: string) {
    return h.app.inject({
      method: 'GET',
      url: `/billing/ad-rewards/${rewardId}`,
      headers: user.auth,
    });
  }

  it('SSV 가 오기 전에는 pending 이다 (실패가 아니다)', async () => {
    const user = await h.createUser();
    const rewardId = (await openSession(user)).json().data.rewardId as string;

    const res = await status(user, rewardId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ rewardId, status: 'pending', credits: null, balance: 0 });
  });

  it('지급되면 granted 와 크레딧·잔액을 함께 준다', async () => {
    const user = await h.createUser();
    const rewardId = await watchAd(user);

    expect((await status(user, rewardId)).json().data).toEqual({
      rewardId,
      status: 'granted',
      credits: REWARD_CREDITS,
      balance: REWARD_CREDITS,
    });
  });

  it('남의 rewardId 는 404 다 (403 으로 존재를 알리지 않는다)', async () => {
    const [owner, other] = [await h.createUser(), await h.createUser()];
    const rewardId = (await openSession(owner)).json().data.rewardId as string;

    expect((await status(other, rewardId)).statusCode).toBe(404);
  });
});

describe('GET /billing/credits', () => {
  it('광고 지급이 내역에 ad_reward 로 보인다', async () => {
    const user = await h.createUser();
    await watchAd(user);

    const res = await h.app.inject({ method: 'GET', url: '/billing/credits', headers: user.auth });
    expect(res.json().data.entries[0]).toMatchObject({
      delta: REWARD_CREDITS,
      reason: 'ad_reward',
    });
  });
});
