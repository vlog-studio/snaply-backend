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

export async function handleWebhookEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object;
  const prisma = getPrisma();

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const customerId = String(obj.customer ?? '');
      const priceId = (obj as { items?: { data?: { price?: { id?: string } }[] } }).items?.data?.[0]
        ?.price?.id;
      const periodEnd = obj.current_period_end
        ? new Date(Number(obj.current_period_end) * 1000)
        : null;
      const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
      if (!sub) return;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: planForPrice(priceId),
          stripeSubscriptionId: String(obj.id ?? sub.stripeSubscriptionId ?? ''),
          status: String(obj.status ?? 'active'),
          currentPeriodEnd: periodEnd,
        },
      });
      return;
    }
    case 'customer.subscription.deleted': {
      const customerId = String(obj.customer ?? '');
      const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
      if (!sub) return;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { plan: 'free', status: 'canceled', stripeSubscriptionId: null },
      });
      return;
    }
    case 'invoice.payment_failed': {
      const customerId = String(obj.customer ?? '');
      const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } });
      if (!sub) return;
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'past_due' } });
      return;
    }
    default:
      return; // 처리하지 않는 이벤트는 무시(200)
  }
}
