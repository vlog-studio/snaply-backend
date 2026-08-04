import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { StripeConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';

// 지연 로딩: mock 모드에서는 stripe SDK를 불러오지 않는다.
let stripeSingleton: unknown = null;
async function getStripe(cfg: StripeConfig): Promise<import('stripe').Stripe> {
  if (!stripeSingleton) {
    const { default: Stripe } = await import('stripe');
    stripeSingleton = new Stripe(cfg.secretKey ?? '');
  }
  return stripeSingleton as import('stripe').Stripe;
}

export async function ensureCustomer(
  cfg: StripeConfig,
  params: { userId: string; email?: string; existingCustomerId?: string | null },
): Promise<string> {
  if (params.existingCustomerId) {
    return params.existingCustomerId;
  }
  if (cfg.mock) {
    return `cus_mock_${createHash('sha1').update(params.userId).digest('hex').slice(0, 14)}`;
  }
  const stripe = await getStripe(cfg);
  const customer = await stripe.customers.create({
    email: params.email,
    metadata: { userId: params.userId },
  });
  return customer.id;
}

export async function createCheckoutSession(
  cfg: StripeConfig,
  params: { customerId: string; priceId: string; successUrl: string; cancelUrl: string },
): Promise<{ url: string; sessionId: string }> {
  if (cfg.mock) {
    const sessionId = `cs_mock_${randomBytes(8).toString('hex')}`;
    return { url: `https://checkout.stripe.com/c/pay/${sessionId}`, sessionId };
  }
  const stripe = await getStripe(cfg);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: params.customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  if (!session.url) {
    throw AppError.badRequest('Checkout 세션 생성에 실패했습니다.');
  }
  return { url: session.url, sessionId: session.id };
}

export async function cancelAtPeriodEnd(cfg: StripeConfig, subscriptionId: string): Promise<void> {
  if (cfg.mock) {
    return;
  }
  const stripe = await getStripe(cfg);
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

export interface StripeEvent {
  id?: string;
  type: string;
  /** 이벤트 생성 시각(unix seconds). 웹훅 순서 보정에 쓴다. */
  created?: number;
  data: { object: Record<string, unknown> };
}

/** 서명 검증 후 이벤트 반환. mock은 HMAC-SHA256(rawBody, webhookSecret) 검증. */
export async function constructEvent(
  cfg: StripeConfig,
  rawBody: Buffer,
  signature: string | undefined,
): Promise<StripeEvent> {
  if (!signature) {
    throw AppError.badRequest('서명이 없습니다.');
  }
  if (cfg.mock) {
    const expected = createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw AppError.badRequest('서명 검증에 실패했습니다.');
    }
    return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
  }
  const stripe = await getStripe(cfg);
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, cfg.webhookSecret) as unknown as StripeEvent;
  } catch {
    throw AppError.badRequest('서명 검증에 실패했습니다.');
  }
}
