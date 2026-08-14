/**
 * 크레딧 원장.
 *
 * `credit_ledger` 는 append-only 이고 **잔액은 언제나 delta 의 합계**다. 잔액을 따로
 * 들고 있는 컬럼은 없다 — 원장과 잔액이 어긋날 여지를 아예 만들지 않기 위해서다.
 * 합계 쿼리가 병목이 되면 그때 `users.credit_balance` 캐시 컬럼을 트랜잭션 안에서
 * 증분 갱신하는 방식으로 얹는다 (docs/plans/iap-migration.md §3).
 *
 * 멱등성의 근거는 두 개의 DB 제약이다.
 * - 구매 지급: `purchases.store_transaction_id` unique
 * - export 예약/환급: `credit_ledger(edit_job_id, reason)` unique
 *
 * 애플리케이션에서 "이미 처리했는지" 먼저 조회해 분기하지 않는다. 웹훅 재전송과
 * 동시 요청은 조회와 삽입 사이를 파고들기 때문에, 판정을 DB 제약에 맡긴다.
 */
import { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import {
  CREDIT_REASON,
  MOVIE_EXPORT_COST,
  signupBonusCredits,
} from './billing/credit-policy.js';

const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

export interface CreditEntryDto {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
}

/** 현재 잔액. 원장 합계가 원천이다. */
export async function getBalance(userId: string): Promise<number> {
  const agg = await getPrisma().creditLedger.aggregate({
    _sum: { delta: true },
    where: { userId },
  });
  return agg._sum.delta ?? 0;
}

export async function listEntries(userId: string, limit = 50): Promise<CreditEntryDto[]> {
  const rows = await getPrisma().creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, delta: true, reason: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * 가입 보너스. 수량이 0이면(=기본값, A-2 미확정) 아무 것도 하지 않는다.
 * 유저 생성 직후에만 호출되며, 실패해도 로그인 자체는 막지 않는다.
 */
export async function grantSignupBonus(userId: string): Promise<void> {
  const amount = signupBonusCredits();
  if (amount <= 0) {
    return;
  }
  const existing = await getPrisma().creditLedger.findFirst({
    where: { userId, reason: CREDIT_REASON.signupBonus },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  await getPrisma().creditLedger.create({
    data: { userId, delta: amount, reason: CREDIT_REASON.signupBonus },
  });
}

/**
 * 예약의 1단계 — 유저 행을 잠그고 잔액을 확인한다. 모자라면 402 `INSUFFICIENT_CREDITS`.
 *
 * **호출부 트랜잭션의 첫 문장이어야 한다.** 잔액을 읽고 쓰는 사이에 다른 요청이 같은
 * 잔액을 읽으면 둘 다 통과하므로 `FOR UPDATE` 로 같은 유저의 예약을 직렬화하는데,
 * 이 잠금을 **다른 INSERT 뒤에** 잡으면 데드락이 난다: `videos`·`edit_jobs` 를 만들 때
 * FK 검사가 같은 `users` 행에 share 락을 걸고, 그 상태에서 서로의 exclusive 락을 기다리기
 * 때문이다(실제로 40P01 로 재현됐다). 잠금을 먼저 잡으면 이후 FK share 락은 같은
 * 트랜잭션이 가져가므로 순환이 생기지 않는다.
 */
export async function assertCreditsForExport(
  tx: Prisma.TransactionClient,
  params: { userId: string; cost?: number },
): Promise<void> {
  const cost = params.cost ?? MOVIE_EXPORT_COST;

  await tx.$queryRaw`SELECT id FROM users WHERE id = ${params.userId}::uuid FOR UPDATE`;

  const agg = await tx.creditLedger.aggregate({
    _sum: { delta: true },
    where: { userId: params.userId },
  });
  const balance = agg._sum.delta ?? 0;
  if (balance < cost) {
    throw new AppError(402, 'INSUFFICIENT_CREDITS', '크레딧이 부족합니다.', {
      required: cost,
      balance,
    });
  }
}

/**
 * 예약의 2단계 — 차감을 원장에 기록한다. `assertCreditsForExport` 가 잡은 잠금이 살아 있는
 * **같은 트랜잭션 안에서**, 작업 레코드 생성과 함께 호출한다. 예약만 남고 작업이
 * 사라지거나 그 반대가 되는 상태를 만들지 않기 위해서다.
 */
export async function recordExportReserve(
  tx: Prisma.TransactionClient,
  params: { userId: string; editJobId: string; cost?: number },
): Promise<void> {
  await tx.creditLedger.create({
    data: {
      userId: params.userId,
      delta: -(params.cost ?? MOVIE_EXPORT_COST),
      reason: CREDIT_REASON.exportReserve,
      editJobId: params.editJobId,
    },
  });
}

/**
 * export 환급. 그 작업에 걸린 순차감액을 그대로 되돌린다.
 *
 * 실제 로직은 DB 함수 `refund_export_credits` 에 있다
 * (마이그레이션 `20260814010000_add_refund_export_credits_function`).
 * 환급을 실행하는 주체가 API(취소·큐 적재 실패)와 워커(실패 확정) 둘이라, 같은 문을 두
 * 언어에 복사하면 한쪽만 고쳐질 수 있다. 두 호출자가 공유할 수 있는 유일한 장소인 DB에
 * 정의를 두고 여기서는 호출만 한다 — **로직을 여기로 다시 옮기지 말 것.**
 *
 * 어느 경로로 몇 번 호출돼도 `(edit_job_id, reason)` unique 제약 때문에 환급은 한 번만
 * 기록된다.
 */
export async function refundForExport(editJobId: string): Promise<void> {
  await getPrisma().$executeRaw`SELECT refund_export_credits(${editJobId}::uuid)`;
}

export interface PurchaseGrant {
  userId: string;
  store: 'apple' | 'google';
  productId: string;
  storeTransactionId: string;
  credits: number;
  environment: 'production' | 'sandbox';
  purchasedAt: Date;
}

/**
 * 구매 지급. 같은 `storeTransactionId` 가 다시 오면 지급하지 않고 `false` 를 돌려준다.
 * 웹훅 재전송과 앱의 `/billing/sync` 가 같은 거래를 동시에 들고 와도 안전하다.
 */
export async function grantForPurchase(grant: PurchaseGrant): Promise<{ granted: boolean }> {
  try {
    await getPrisma().$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          userId: grant.userId,
          store: grant.store,
          productId: grant.productId,
          storeTransactionId: grant.storeTransactionId,
          creditsGranted: grant.credits,
          environment: grant.environment,
          purchasedAt: grant.purchasedAt,
        },
        select: { id: true },
      });
      await tx.creditLedger.create({
        data: {
          userId: grant.userId,
          delta: grant.credits,
          reason: CREDIT_REASON.purchase,
          purchaseId: purchase.id,
        },
      });
    });
    return { granted: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { granted: false }; // 이미 지급된 거래
    }
    throw err;
  }
}

/**
 * 스토어 환불 회수. 지급분을 그대로 빼며, **잔액이 음수가 되는 것을 허용한다** —
 * 이미 만들어진 결과물을 회수할 수는 없으므로, 음수 잔액이 신규 export 를 막는 형태로
 * 남는 것이 맞다 (docs/plans/iap-migration.md §4).
 *
 * 구독 환불과는 처리가 완전히 다르므로 이 함수에 합치지 않는다.
 */
export async function revokeForStoreRefund(storeTransactionId: string): Promise<void> {
  const prisma = getPrisma();
  const purchase = await prisma.purchase.findUnique({
    where: { storeTransactionId },
    select: { id: true, userId: true, creditsGranted: true },
  });
  if (!purchase) {
    return; // 지급된 적 없는 거래 — 회수할 것이 없다
  }

  await prisma.$transaction(async (tx) => {
    // status 전이를 조건으로 걸어 두 번째 환불 웹훅이 통과하지 못하게 한다.
    const updated = await tx.purchase.updateMany({
      where: { id: purchase.id, status: 'completed' },
      data: { status: 'refunded', refundedAt: new Date() },
    });
    if (updated.count === 0) {
      return; // 이미 회수됨
    }
    await tx.creditLedger.create({
      data: {
        userId: purchase.userId,
        delta: -purchase.creditsGranted,
        reason: CREDIT_REASON.storeRefundRevoke,
        purchaseId: purchase.id,
      },
    });
  });
}
