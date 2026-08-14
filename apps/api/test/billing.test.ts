/**
 * 크레딧 결제 (IAP + RevenueCat).
 *
 * 실키 없이도 우리 쪽 로직(웹훅 인증·멱등 지급·환불 회수·예약/환급·동시 요청)은 전부 검증한다.
 * 지급 멱등성의 근거가 DB 제약이므로, 테스트도 "같은 이벤트를 두 번 보낸다"처럼
 * 실제 재전송과 같은 모양으로 확인한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { MOVIE_EXPORT_COST } from '../src/services/billing/credit-policy.js';

let h: Harness;

const WEBHOOK_TOKEN = 'test-webhook-token';
const PACK_SMALL = 'credit_pack_small';
const PACK_SMALL_CREDITS = 500;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

function purchaseEvent(params: {
  userId: string;
  transactionId?: string;
  productId?: string;
  type?: string;
  store?: string;
}) {
  return {
    api_version: '1.0',
    event: {
      id: `evt_${randomUUID()}`,
      type: params.type ?? 'NON_RENEWING_PURCHASE',
      app_user_id: params.userId,
      product_id: params.productId ?? PACK_SMALL,
      transaction_id: params.transactionId ?? `txn_${randomUUID()}`,
      store: params.store ?? 'APP_STORE',
      environment: 'SANDBOX',
      purchased_at_ms: Date.now(),
    },
  };
}

/** token 에 null 을 주면 Authorization 헤더 자체를 보내지 않는다. */
function postWebhook(body: unknown, token: string | null = WEBHOOK_TOKEN) {
  return h.app.inject({
    method: 'POST',
    url: '/billing/webhook/revenuecat',
    headers: {
      'content-type': 'application/json',
      ...(token === null ? {} : { authorization: token }),
    },
    payload: JSON.stringify(body),
  });
}

async function balanceOf(user: TestUser): Promise<number> {
  const res = await h.app.inject({ method: 'GET', url: '/billing/credits', headers: user.auth });
  expect(res.statusCode).toBe(200);
  return res.json().data.balance as number;
}

/** 결제 없이 잔액을 만든다 — 예약·환급 검증의 준비 단계. */
async function seedCredits(user: TestUser, amount: number): Promise<void> {
  await h.prisma.creditLedger.create({
    data: { userId: user.id, delta: amount, reason: 'promo' },
  });
}

describe('GET /billing/products', () => {
  it('크레딧 팩 메타를 표시 순서대로 준다 (가격은 없다)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/billing/products' });
    expect(res.statusCode).toBe(200);

    const packs = res.json().data as { productId: string; credits: number }[];
    expect(packs.length).toBeGreaterThan(0);
    expect(packs[0]).toEqual({
      productId: PACK_SMALL,
      credits: PACK_SMALL_CREDITS,
      displayOrder: 1,
    });
    // 가격의 원천은 스토어다. 서버가 내리면 스토어 가격과 어긋난 값이 화면에 뜬다.
    expect(Object.keys(packs[0] ?? {})).not.toContain('priceKrw');
  });
});

describe('POST /billing/webhook/revenuecat', () => {
  it('인증 헤더가 다르면 401 이고 본문을 처리하지 않는다', async () => {
    const user = await h.createUser();
    const res = await postWebhook(purchaseEvent({ userId: user.id }), 'wrong-token');

    expect(res.statusCode).toBe(401);
    expect(await balanceOf(user)).toBe(0);
    expect(await h.prisma.purchase.count()).toBe(0);
  });

  it('인증 헤더가 없어도 401', async () => {
    const user = await h.createUser();
    expect((await postWebhook(purchaseEvent({ userId: user.id }), null)).statusCode).toBe(401);
    expect(await balanceOf(user)).toBe(0);
  });

  it('구매 이벤트로 크레딧을 지급한다', async () => {
    const user = await h.createUser();
    const res = await postWebhook(purchaseEvent({ userId: user.id }));

    expect(res.statusCode).toBe(200);
    expect(await balanceOf(user)).toBe(PACK_SMALL_CREDITS);

    const purchase = await h.prisma.purchase.findFirst({ where: { userId: user.id } });
    expect(purchase).toMatchObject({
      store: 'apple',
      productId: PACK_SMALL,
      creditsGranted: PACK_SMALL_CREDITS,
      status: 'completed',
      environment: 'sandbox',
    });
  });

  it('같은 거래가 다시 와도 크레딧은 한 번만 지급된다', async () => {
    const user = await h.createUser();
    const event = purchaseEvent({ userId: user.id });

    expect((await postWebhook(event)).statusCode).toBe(200);
    expect((await postWebhook(event)).statusCode).toBe(200);

    expect(await balanceOf(user)).toBe(PACK_SMALL_CREDITS);
    expect(await h.prisma.purchase.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await h.prisma.creditLedger.count({ where: { userId: user.id, reason: 'purchase' } }),
    ).toBe(1);
  });

  it('카탈로그에 없는 상품은 지급하지 않고 실패로 남긴다 (재시도로 복구 가능)', async () => {
    const user = await h.createUser();
    const res = await postWebhook(purchaseEvent({ userId: user.id, productId: 'credit_pack_???' }));

    // 2xx 를 주면 RevenueCat 이 재시도를 멈춰 지급이 영영 누락된다.
    expect(res.statusCode).toBe(500);
    expect(await balanceOf(user)).toBe(0);
    expect(await h.prisma.purchase.count()).toBe(0);
  });

  it('환불 이벤트로 지급분을 회수하고 잔액이 음수가 될 수 있다', async () => {
    const user = await h.createUser();
    const transactionId = `txn_${randomUUID()}`;

    await postWebhook(purchaseEvent({ userId: user.id, transactionId }));
    // 크레딧을 다 쓴 뒤 환불이 들어오는 상황
    await h.prisma.creditLedger.create({
      data: { userId: user.id, delta: -PACK_SMALL_CREDITS, reason: 'promo' },
    });

    const res = await postWebhook(
      purchaseEvent({ userId: user.id, transactionId, type: 'REFUND' }),
    );
    expect(res.statusCode).toBe(200);

    // 이미 만들어진 결과물은 회수할 수 없으므로 음수 잔액으로 남는다.
    expect(await balanceOf(user)).toBe(-PACK_SMALL_CREDITS);
    const purchase = await h.prisma.purchase.findUnique({ where: { storeTransactionId: transactionId } });
    expect(purchase?.status).toBe('refunded');
    expect(purchase?.refundedAt).not.toBeNull();
  });

  it('환불 이벤트가 두 번 와도 한 번만 회수한다', async () => {
    const user = await h.createUser();
    const transactionId = `txn_${randomUUID()}`;
    await postWebhook(purchaseEvent({ userId: user.id, transactionId }));

    const refund = purchaseEvent({ userId: user.id, transactionId, type: 'REFUND' });
    await postWebhook(refund);
    await postWebhook(refund);

    expect(await balanceOf(user)).toBe(0);
    expect(
      await h.prisma.creditLedger.count({
        where: { userId: user.id, reason: 'store_refund_revoke' },
      }),
    ).toBe(1);
  });

  it('처리 대상이 아닌 이벤트는 조용히 무시한다', async () => {
    const user = await h.createUser();
    const res = await postWebhook(purchaseEvent({ userId: user.id, type: 'INITIAL_PURCHASE' }));

    expect(res.statusCode).toBe(200);
    expect(await balanceOf(user)).toBe(0);
  });
});

describe('GET /billing/credits', () => {
  it('잔액과 내역을 최신순으로 준다', async () => {
    const user = await h.createUser();
    await postWebhook(purchaseEvent({ userId: user.id }));

    const res = await h.app.inject({ method: 'GET', url: '/billing/credits', headers: user.auth });
    expect(res.statusCode).toBe(200);

    const data = res.json().data as { balance: number; entries: { delta: number; reason: string }[] };
    expect(data.balance).toBe(PACK_SMALL_CREDITS);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ delta: PACK_SMALL_CREDITS, reason: 'purchase' });
  });

  it('인증이 없으면 401', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/billing/credits' })).statusCode).toBe(401);
  });
});

describe('POST /billing/sync', () => {
  it('mock 모드에서는 조회할 구매가 없어 지급이 0이고 잔액은 그대로다', async () => {
    const user = await h.createUser();
    await seedCredits(user, 300);

    const res = await h.app.inject({ method: 'POST', url: '/billing/sync', headers: user.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ granted: 0, balance: 300 });
  });
});

describe('export 크레딧 예약·환급', () => {
  async function readyVideo(user: TestUser): Promise<string> {
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'ready', s3Key: `u/${user.id}/a.mp4` },
    });
    return video.id;
  }

  function createJob(user: TestUser, videoId: string) {
    return h.app.inject({
      method: 'POST',
      url: '/edit-jobs',
      headers: user.auth,
      payload: {
        clips: [{ videoId, startMs: 0, endMs: 3000 }],
        stylePreset: '일상',
        outputProfile: 'short_vertical',
        fitMode: 'contain',
      },
    });
  }

  it('잔액이 모자라면 402 INSUFFICIENT_CREDITS 로 거절하고 작업을 만들지 않는다', async () => {
    const user = await h.createUser();
    await seedCredits(user, MOVIE_EXPORT_COST - 1);
    const videoId = await readyVideo(user);

    const res = await createJob(user, videoId);
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toMatchObject({
      code: 'INSUFFICIENT_CREDITS',
      required: MOVIE_EXPORT_COST,
      balance: MOVIE_EXPORT_COST - 1,
    });

    // 예약이 실패하면 작업·결과물 레코드도 남지 않는다 (같은 트랜잭션).
    expect(await h.prisma.editJob.count({ where: { userId: user.id } })).toBe(0);
    expect(await h.prisma.video.count({ where: { userId: user.id, kind: 'result' } })).toBe(0);
    expect(await balanceOf(user)).toBe(MOVIE_EXPORT_COST - 1);
  });

  it('작업을 만들면 예약으로 차감된다', async () => {
    const user = await h.createUser();
    await seedCredits(user, MOVIE_EXPORT_COST * 2);
    const videoId = await readyVideo(user);

    const res = await createJob(user, videoId);
    expect(res.statusCode).toBe(202);

    const jobId = res.json().data.jobId as string;
    expect(await balanceOf(user)).toBe(MOVIE_EXPORT_COST);
    const entry = await h.prisma.creditLedger.findFirst({ where: { editJobId: jobId } });
    expect(entry).toMatchObject({ delta: -MOVIE_EXPORT_COST, reason: 'export_reserve' });
  });

  it('취소하면 예약분을 환급한다', async () => {
    const user = await h.createUser();
    await seedCredits(user, MOVIE_EXPORT_COST);
    const videoId = await readyVideo(user);
    const jobId = (await createJob(user, videoId)).json().data.jobId as string;

    const res = await h.app.inject({
      method: 'DELETE',
      url: `/edit-jobs/${jobId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(await balanceOf(user)).toBe(MOVIE_EXPORT_COST);
  });

  it('취소를 두 번 해도 환급은 한 번만 기록된다', async () => {
    const user = await h.createUser();
    await seedCredits(user, MOVIE_EXPORT_COST);
    const videoId = await readyVideo(user);
    const jobId = (await createJob(user, videoId)).json().data.jobId as string;

    const url = `/edit-jobs/${jobId}`;
    await h.app.inject({ method: 'DELETE', url, headers: user.auth });
    await h.app.inject({ method: 'DELETE', url, headers: user.auth }); // 멱등 취소

    expect(await balanceOf(user)).toBe(MOVIE_EXPORT_COST);
    expect(
      await h.prisma.creditLedger.count({ where: { editJobId: jobId, reason: 'export_refund' } }),
    ).toBe(1);
  });

  it('잔액이 1회분일 때 동시에 2건을 요청하면 1건만 성공한다', async () => {
    const user = await h.createUser();
    await seedCredits(user, MOVIE_EXPORT_COST);
    const videoId = await readyVideo(user);

    const [a, b] = await Promise.all([createJob(user, videoId), createJob(user, videoId)]);
    const codes = [a.statusCode, b.statusCode].sort();

    expect(codes).toEqual([202, 402]);
    expect(await balanceOf(user)).toBe(0);
    expect(await h.prisma.editJob.count({ where: { userId: user.id } })).toBe(1);
  });
});
