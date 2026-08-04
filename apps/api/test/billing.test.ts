/**
 * Phase 8 — 결제 시스템 (Dev B 트랙).
 * Stripe 실키 없이도 우리 쪽 로직(서명 검증·플랜 전이·순서 보정·플랜별 제한)은 전부 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

const WEBHOOK_SECRET = 'whsec_test_secret';
const PRICE_STANDARD = 'price_test_standard';
const PRICE_PREMIUM = 'price_test_premium';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

/** mock 모드의 서명 방식: HMAC-SHA256(rawBody, webhookSecret) */
function sign(rawBody: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

function subscriptionEvent(params: {
  type: string;
  customerId: string;
  priceId?: string;
  status?: string;
  subscriptionId?: string;
  createdAt?: Date;
  periodEnd?: Date;
  /** true 면 current_period_end 를 item 하위에만 넣는다 (2025+ API 버전 형태) */
  periodEndOnItem?: boolean;
}) {
  const periodEndUnix = Math.floor((params.periodEnd ?? new Date(Date.now() + 30 * 86_400_000)).getTime() / 1000);
  const item: Record<string, unknown> = { price: { id: params.priceId ?? PRICE_STANDARD } };
  const object: Record<string, unknown> = {
    id: params.subscriptionId ?? 'sub_test_1',
    customer: params.customerId,
    status: params.status ?? 'active',
    items: { data: [item] },
  };
  if (params.periodEndOnItem) {
    item.current_period_end = periodEndUnix;
  } else {
    object.current_period_end = periodEndUnix;
  }
  return {
    id: `evt_${randomUUID()}`,
    type: params.type,
    created: Math.floor((params.createdAt ?? new Date()).getTime() / 1000),
    data: { object },
  };
}

function postWebhook(event: unknown, signature?: string) {
  const raw = JSON.stringify(event);
  return h.app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: {
      'content-type': 'application/json',
      ...(signature === undefined ? { 'stripe-signature': sign(raw) } : { 'stripe-signature': signature }),
    },
    payload: raw,
  });
}

/** 체크아웃까지 진행해 stripeCustomerId 가 붙은 상태를 만든다. */
async function startCheckout(user: TestUser, plan: 'standard' | 'premium' = 'standard') {
  const res = await h.app.inject({
    method: 'POST',
    url: '/billing/checkout',
    headers: user.auth,
    payload: { plan },
  });
  expect(res.statusCode).toBe(200);
  const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
  return { checkoutUrl: res.json().data.checkoutUrl as string, customerId: sub.stripeCustomerId! };
}

describe('GET /billing/plans', () => {
  it('인증 없이 조회할 수 있다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/billing/plans' });
    expect(res.statusCode).toBe(200);
    const plans = res.json().data;
    expect(plans.map((p: { plan: string }) => p.plan)).toEqual(['free', 'standard', 'premium']);
    expect(plans[1]).toMatchObject({ priceKrw: 9900 });
  });
});

describe('GET /billing/subscription', () => {
  it('구독한 적 없으면 free', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'GET',
      url: '/billing/subscription',
      headers: user.auth,
    });
    expect(res.json().data).toEqual({ plan: 'free', status: 'active', currentPeriodEnd: null });
  });

  it('인증이 없으면 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/billing/subscription' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /billing/checkout', () => {
  it('Checkout URL 을 주지만 결제 전에는 플랜을 올리지 않는다', async () => {
    const user = await h.createUser();

    const { checkoutUrl, customerId } = await startCheckout(user);

    expect(checkoutUrl).toContain('checkout.stripe.com');
    expect(customerId).toBeTruthy();
    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('free'); // 웹훅 전까지는 free
  });

  it('두 번 호출해도 같은 Stripe 고객을 재사용한다', async () => {
    const user = await h.createUser();
    const first = await startCheckout(user);
    const second = await startCheckout(user, 'premium');
    expect(second.customerId).toBe(first.customerId);
    expect(await h.prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it('알 수 없는 플랜은 400', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'POST',
      url: '/billing/checkout',
      headers: user.auth,
      payload: { plan: 'gold' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /billing/webhook — 서명 검증', () => {
  it('서명이 없으면 400', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ type: 'ping', data: { object: {} } }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('서명이 틀리면 400', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    const res = await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId }),
      'deadbeef',
    );
    expect(res.statusCode).toBe(400);
    expect((await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } })).plan).toBe('free');
  });

  it('본문이 변조되면 서명이 깨져 400', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    const event = subscriptionEvent({ type: 'customer.subscription.created', customerId });
    const goodSignature = sign(JSON.stringify(event));

    const tampered = { ...event, data: { object: { ...event.data.object, customer: 'cus_other' } } };
    const res = await h.app.inject({
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': goodSignature },
      payload: JSON.stringify(tampered),
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /billing/webhook — 구독 상태 동기화', () => {
  it('결제 완료(subscription.created) 면 플랜이 올라간다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);

    const res = await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId }),
    );

    expect(res.statusCode).toBe(200);
    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('standard');
    expect(sub.status).toBe('active');
    expect(sub.stripeSubscriptionId).toBe('sub_test_1');
    expect(sub.currentPeriodEnd).not.toBeNull();
  });

  it('premium 가격이면 premium 으로 매핑된다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user, 'premium');
    await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId, priceId: PRICE_PREMIUM }),
    );
    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('premium');
  });

  it('current_period_end 가 item 아래에만 있어도 읽는다 (2025+ API 버전)', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);

    await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId, periodEndOnItem: true }),
    );

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.currentPeriodEnd).not.toBeNull();
  });

  it('해지(subscription.deleted) 면 free 로 돌아간다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    await postWebhook(subscriptionEvent({ type: 'customer.subscription.created', customerId }));

    await postWebhook(
      subscriptionEvent({
        type: 'customer.subscription.deleted',
        customerId,
        createdAt: new Date(Date.now() + 1000),
      }),
    );

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('free');
    expect(sub.status).toBe('canceled');
    expect(sub.stripeSubscriptionId).toBeNull();
  });

  it('결제 실패면 past_due 가 되지만 플랜은 유지된다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    await postWebhook(subscriptionEvent({ type: 'customer.subscription.created', customerId }));

    await postWebhook({
      id: `evt_${randomUUID()}`,
      type: 'invoice.payment_failed',
      created: Math.floor((Date.now() + 1000) / 1000),
      data: { object: { customer: customerId } },
    });

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.status).toBe('past_due');
    expect(sub.plan).toBe('standard');
  });

  it('모르는 고객의 이벤트는 200 으로 무시한다', async () => {
    const res = await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId: 'cus_unknown' }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('처리하지 않는 이벤트 타입도 200', async () => {
    const res = await postWebhook({
      id: 'evt_x',
      type: 'charge.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    });
    expect(res.statusCode).toBe(200);
  });

  it('같은 이벤트가 중복 전달돼도 결과가 같다 (멱등)', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    const event = subscriptionEvent({ type: 'customer.subscription.created', customerId });

    await postWebhook(event);
    await postWebhook(event);
    await postWebhook(event);

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('standard');
  });

  it('오래된 이벤트가 뒤늦게 와도 최신 상태를 덮지 않는다 (순서 보정)', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    const now = new Date();

    // 최신: premium 으로 업그레이드
    await postWebhook(
      subscriptionEvent({
        type: 'customer.subscription.updated',
        customerId,
        priceId: PRICE_PREMIUM,
        createdAt: now,
      }),
    );
    // 지연 도착: 1시간 전의 standard 이벤트
    await postWebhook(
      subscriptionEvent({
        type: 'customer.subscription.updated',
        customerId,
        priceId: PRICE_STANDARD,
        createdAt: new Date(now.getTime() - 3600_000),
      }),
    );

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('premium');
  });

  it('해지 뒤 재구독(더 최신 이벤트)은 정상 반영된다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    const t0 = Date.now();

    await postWebhook(
      subscriptionEvent({ type: 'customer.subscription.created', customerId, createdAt: new Date(t0) }),
    );
    await postWebhook(
      subscriptionEvent({
        type: 'customer.subscription.deleted',
        customerId,
        createdAt: new Date(t0 + 1000),
      }),
    );
    await postWebhook(
      subscriptionEvent({
        type: 'customer.subscription.created',
        customerId,
        subscriptionId: 'sub_test_2',
        createdAt: new Date(t0 + 2000),
      }),
    );

    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.plan).toBe('standard');
    expect(sub.stripeSubscriptionId).toBe('sub_test_2');
  });
});

describe('POST /billing/cancel', () => {
  it('기간 만료 후 해지로 표시하고 플랜은 유지한다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    await postWebhook(subscriptionEvent({ type: 'customer.subscription.created', customerId }));

    const res = await h.app.inject({
      method: 'POST',
      url: '/billing/cancel',
      headers: user.auth,
    });

    expect(res.statusCode).toBe(200);
    const sub = await h.prisma.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(sub.status).toBe('canceling');
    expect(sub.plan).toBe('standard'); // 즉시 다운그레이드 아님
  });

  it('구독이 없으면 400', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({ method: 'POST', url: '/billing/cancel', headers: user.auth });
    expect(res.statusCode).toBe(400);
  });
});

describe('플랜별 편집 제한', () => {
  async function createReadyVideo(userId: string) {
    return h.prisma.video.create({
      data: {
        userId,
        originalUrls: ['https://cdn.example.com/clip.mp4'],
        status: 'ready',
        s3Key: `uploads/${userId}/${randomUUID()}.mp4`,
      },
      select: { id: true },
    });
  }

  function requestEdit(user: TestUser, videoId: string) {
    return h.app.inject({
      method: 'POST',
      url: '/edit-jobs',
      headers: user.auth,
      payload: { videoIds: [videoId], stylePreset: '일상' },
    });
  }

  it('Free 플랜은 월 3편까지, 4편째는 403', async () => {
    const user = await h.createUser();
    const video = await createReadyVideo(user.id);

    for (let i = 0; i < 3; i += 1) {
      expect((await requestEdit(user, video.id)).statusCode).toBe(202);
    }
    const fourth = await requestEdit(user, video.id);

    expect(fourth.statusCode).toBe(403);
    expect(fourth.json().error.message).toContain('무료 플랜');
  });

  it('결제 웹훅으로 standard 가 되면 4편째도 통과한다', async () => {
    const user = await h.createUser();
    const { customerId } = await startCheckout(user);
    await postWebhook(subscriptionEvent({ type: 'customer.subscription.created', customerId }));
    const video = await createReadyVideo(user.id);

    for (let i = 0; i < 4; i += 1) {
      expect((await requestEdit(user, video.id)).statusCode).toBe(202);
    }
  });
});
