/**
 * Phase 8 — 실키 모드(STRIPE_MOCK=false)의 웹훅 서명 검증.
 *
 * mock 모드는 단순 HMAC(rawBody) 이지만, 실제 Stripe 는
 *   Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256("<t>.<rawBody>", whsec)>
 * 형식이고 타임스탬프 허용 오차(기본 5분)까지 본다.
 * 이 경로는 네트워크 없이 검증 가능하므로, Stripe CLI 의 whsec 을 꽂기 전에 미리 고정해둔다.
 *
 * 키는 실제 계정 키가 아니라 더미를 쓴다 — 서명 검증은 로컬 crypto 라 네트워크를 타지 않는다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

const WHSEC = 'whsec_offline_signature_check';

beforeAll(async () => {
  h = await createHarness({
    // 실제 SDK 경로를 타게 하려면 secretKey 가 있어야 한다(= mock 해제).
    STRIPE_SECRET_KEY: 'sk_test_dummy_offline_only',
    STRIPE_WEBHOOK_SECRET: WHSEC,
  });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

/** 실제 Stripe 형식의 Stripe-Signature 헤더를 만든다. */
function stripeSignature(rawBody: string, timestampSec: number, secret = WHSEC): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest('hex');
  return `t=${timestampSec},v1=${signature}`;
}

function post(rawBody: string, signatureHeader: string) {
  return h.app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: { 'content-type': 'application/json', 'stripe-signature': signatureHeader },
    payload: rawBody,
  });
}

/** 실키 모드에서는 mock 고객 ID 생성이 안 되므로 구독 행을 직접 만든다. */
async function seedSubscription(user: TestUser): Promise<string> {
  const customerId = `cus_test_${randomUUID().slice(0, 8)}`;
  await h.prisma.subscription.create({
    data: { userId: user.id, plan: 'free', status: 'active', stripeCustomerId: customerId },
  });
  return customerId;
}

function subscriptionCreated(customerId: string, priceId = 'price_test_standard') {
  return JSON.stringify({
    id: `evt_${randomUUID()}`,
    type: 'customer.subscription.created',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'sub_real_1',
        customer: customerId,
        status: 'active',
        current_period_end: Math.floor((Date.now() + 30 * 86_400_000) / 1000),
        items: { data: [{ price: { id: priceId } }] },
      },
    },
  });
}

describe('실제 Stripe 서명 형식', () => {
  it('올바른 t=,v1= 서명이면 200 + 구독 반영', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const raw = subscriptionCreated(customerId);
    const now = Math.floor(Date.now() / 1000);

    const res = await post(raw, stripeSignature(raw, now));

    expect(res.statusCode).toBe(200);
    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('standard');
    expect(sub.stripeSubscriptionId).toBe('sub_real_1');
  });

  it('mock 형식(단순 hex HMAC)은 실키 모드에서 거부된다', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const raw = subscriptionCreated(customerId);

    // Phase 8 mock 모드가 쓰던 형식 — 실제 Stripe 는 t=,v1= 를 요구한다
    const res = await post(raw, createHmac('sha256', WHSEC).update(raw).digest('hex'));

    expect(res.statusCode).toBe(400);
    expect((await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).plan).toBe('free');
  });

  it('시크릿이 다르면 400', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const raw = subscriptionCreated(customerId);
    const now = Math.floor(Date.now() / 1000);

    const res = await post(raw, stripeSignature(raw, now, 'whsec_wrong'));

    expect(res.statusCode).toBe(400);
  });

  it('타임스탬프가 허용 오차(5분)를 벗어나면 400 — 재전송 공격 방어', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const raw = subscriptionCreated(customerId);
    const stale = Math.floor(Date.now() / 1000) - 10 * 60;

    const res = await post(raw, stripeSignature(raw, stale));

    expect(res.statusCode).toBe(400);
  });

  it('본문이 1바이트라도 바뀌면 400', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const raw = subscriptionCreated(customerId);
    const now = Math.floor(Date.now() / 1000);
    const header = stripeSignature(raw, now);

    const res = await post(`${raw} `, header);

    expect(res.statusCode).toBe(400);
  });

  it('서명 헤더가 없으면 400', async () => {
    const user = await h.createUser();
    const customerId = await seedSubscription(user);
    const res = await h.app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json' },
      payload: subscriptionCreated(customerId),
    });
    expect(res.statusCode).toBe(400);
  });
});
