import type { Plan } from '@vlog-studio/shared-types';
import type { StripeConfig } from '../config.js';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import {
  ensureCustomer,
  createCheckoutSession,
  cancelAtPeriodEnd,
  constructEvent,
  type StripeEvent,
} from './billing/stripe.client.js';

let cfg: StripeConfig | null = null;
let deepLinkScheme = 'snaply://';

export function initBilling(stripeConfig: StripeConfig, scheme: string): void {
  cfg = stripeConfig;
  deepLinkScheme = scheme;
}

function config(): StripeConfig {
  if (!cfg) {
    throw new Error('billing이 초기화되지 않았습니다. initBilling()을 먼저 호출하세요.');
  }
  return cfg;
}

export interface PlanInfo {
  plan: Plan;
  name: string;
  priceKrw: number;
  features: string[];
}

export function getPlans(): PlanInfo[] {
  return [
    { plan: 'free', name: 'Free', priceKrw: 0, features: ['월 3편 편집', '720p', '워터마크'] },
    { plan: 'standard', name: 'Standard', priceKrw: 9900, features: ['무제한 편집', '1080p', '워터마크 없음'] },
    { plan: 'premium', name: 'Premium', priceKrw: 24900, features: ['무제한 편집', '4K', '워터마크 없음', '추가 기능'] },
  ];
}

function priceIdFor(plan: Exclude<Plan, 'free'>): string {
  return plan === 'standard' ? config().priceStandard : config().pricePremium;
}

function planForPrice(priceId: string | undefined): Plan {
  if (priceId === config().priceStandard) return 'standard';
  if (priceId === config().pricePremium) return 'premium';
  return 'free';
}

export async function createCheckout(params: {
  userId: string;
  email?: string;
  plan: Exclude<Plan, 'free'>;
}): Promise<{ checkoutUrl: string }> {
  const prisma = getPrisma();
  const existing = await prisma.subscription.findUnique({
    where: { userId: params.userId },
    select: { stripeCustomerId: true },
  });

  const customerId = await ensureCustomer(config(), {
    userId: params.userId,
    email: params.email,
    existingCustomerId: existing?.stripeCustomerId,
  });

  // 고객 ID를 저장(구독 반영은 결제 성공 웹훅에서만) — 아직 plan은 그대로 free
  await prisma.subscription.upsert({
    where: { userId: params.userId },
    update: { stripeCustomerId: customerId },
    create: { userId: params.userId, plan: 'free', stripeCustomerId: customerId, status: 'active' },
  });

  const { url } = await createCheckoutSession(config(), {
    customerId,
    priceId: priceIdFor(params.plan),
    successUrl: `${deepLinkScheme}billing/success`,
    cancelUrl: `${deepLinkScheme}billing/cancel`,
  });
  return { checkoutUrl: url };
}

export interface SubscriptionDto {
  plan: Plan;
  status: string;
  currentPeriodEnd: string | null;
}

export async function getSubscription(userId: string): Promise<SubscriptionDto> {
  const sub = await getPrisma().subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true, currentPeriodEnd: true },
  });
  if (!sub) {
    return { plan: 'free', status: 'active', currentPeriodEnd: null };
  }
  return {
    plan: sub.plan as Plan,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function cancelSubscription(userId: string): Promise<void> {
  const sub = await getPrisma().subscription.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true },
  });
  if (!sub?.stripeSubscriptionId) {
    throw AppError.badRequest('취소할 구독이 없습니다.');
  }
  // 즉시 취소가 아니라 기간 만료 후 해지
  await cancelAtPeriodEnd(config(), sub.stripeSubscriptionId);
  await getPrisma().subscription.update({
    where: { userId },
    data: { status: 'canceling' },
  });
}

// ── 웹훅 ────────────────────────────────────────────────

export async function parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<StripeEvent> {
  return constructEvent(config(), rawBody, signature);
}

/**
 * 구독 기간 종료 시각을 읽는다.
 * Stripe 는 2025년 API 버전에서 current_period_end 를 subscription 최상위에서
 * subscription item 아래로 옮겼다. 계정의 API 버전에 따라 둘 중 하나에만 값이 있으므로 모두 확인한다.
 */
function readPeriodEnd(obj: Record<string, unknown>): Date | null {
  const top = obj.current_period_end;
  if (top) {
    return new Date(Number(top) * 1000);
  }
  const item = (obj as { items?: { data?: { current_period_end?: number }[] } }).items?.data?.[0];
  return item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
}

export async function handleWebhookEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object;
  const prisma = getPrisma();
  const handled = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
  ];
  if (!handled.includes(event.type)) {
    return; // 처리하지 않는 이벤트는 무시(200)
  }

  const customerId = String(obj.customer ?? '');
  const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
  if (!sub) {
    return; // 우리가 모르는 고객 — 조용히 200
  }

  // 웹훅은 순서를 보장하지 않는다. 이미 반영한 것보다 오래된 이벤트면 무시해
  // 최신 상태가 과거 상태로 덮이는 것을 막는다. (중복 전달은 재적용해도 결과가 같다.)
  const eventAt = event.created ? new Date(event.created * 1000) : new Date();
  if (sub.lastStripeEventAt && eventAt < sub.lastStripeEventAt) {
    return;
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const priceId = (obj as { items?: { data?: { price?: { id?: string } }[] } }).items?.data?.[0]
        ?.price?.id;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: planForPrice(priceId),
          stripeSubscriptionId: String(obj.id ?? sub.stripeSubscriptionId ?? ''),
          status: String(obj.status ?? 'active'),
          currentPeriodEnd: readPeriodEnd(obj),
          lastStripeEventAt: eventAt,
        },
      });
      return;
    }
    case 'customer.subscription.deleted': {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: 'free',
          status: 'canceled',
          stripeSubscriptionId: null,
          lastStripeEventAt: eventAt,
        },
      });
      return;
    }
    case 'invoice.payment_failed': {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'past_due', lastStripeEventAt: eventAt },
      });
      return;
    }
  }
}
