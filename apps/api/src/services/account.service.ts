/**
 * 계정 삭제 수명주기 (docs/decisions/account-deletion.md)
 *
 * 1) deleteAccount   — 소프트 삭제 + 즉시 정리(구독 해지·FCM·SNS 토큰·편집 작업)
 * 2) restoreAccount  — 유예 기간(30일) 내 복구
 * 3) purgeExpiredAccounts — 유예 만료분 실삭제(S3 → Supabase Auth → DB Cascade)
 */
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { captureException } from '../lib/sentry.js';
import { removeEditJob } from '../queue/edit-queue.js';
import { refundForExport } from './credit.service.js';
import { deleteObjectsByPrefix } from './storage.service.js';
import { deleteAuthUser } from './supabase-admin.service.js';

/** 삭제 요청 후 실삭제까지의 유예 기간. 백로그 A-4 에서 30일로 확정. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

const GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * 삭제 요청 시각(`users.deleted_at`)으로부터 실삭제 예정 시각.
 * 삭제 응답과 삭제 대기 계정의 403 응답이 같은 값을 내려야 하므로 계산은 여기 하나뿐이다.
 */
export function purgeAfterFor(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + GRACE_MS);
}

/**
 * 계정 소프트 삭제.
 *
 * 해지할 정기 구독은 없다 — 제품 모델에서 제거했다
 * (docs/decisions/credit-payment-model.md). 잔여 크레딧은 유예 기간 후 실삭제 시
 * 원장과 함께 사라진다(FK cascade). 유예 중에는 복구가 가능하므로 여기서 소멸시키지 않는다.
 */
export async function deleteAccount(userId: string): Promise<{ purgeAfter: Date }> {
  const prisma = getPrisma();

  const pendingJobs = await prisma.editJob.findMany({
    where: { userId, status: { in: ['queued', 'processing'] } },
    select: { id: true },
  });

  const now = new Date();
  await prisma.$transaction([
    // 취소의 최종 상태는 사용자 취소(DELETE /edit-jobs/:id)와 동일하게 'canceled'
    prisma.editJob.updateMany({
      where: { userId, status: { in: ['queued', 'processing'] } },
      data: { status: 'canceled', errorMessage: '계정 삭제로 취소되었습니다.', completedAt: now },
    }),
    // 암호화 토큰이라도 보유할 이유가 없다 — 유예 기간을 기다리지 않고 즉시 삭제
    prisma.snsConnection.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt: now, fcmToken: null },
    }),
  ]);

  // 큐 제거는 최선 노력 — 워커가 이미 잡은 작업은 제거되지 않고, GC 가 산출물을 정리한다.
  // 취소된 작업의 예약 크레딧은 사용자 취소와 동일하게 환급한다 (유예 중 복구가 가능하므로).
  for (const job of pendingJobs) {
    await removeEditJob(job.id);
    await refundForExport(job.id);
  }

  return { purgeAfter: purgeAfterFor(now) };
}

/** 유예 기간 내 복구. FCM 토큰·SNS 연동·구독은 이미 정리됐으므로 되살아나지 않는다. */
export async function restoreAccount(userId: string): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  if (!user?.deletedAt) {
    throw AppError.badRequest('삭제 대기 중인 계정이 아닙니다.');
  }
  await prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
}

export interface PurgeCandidate {
  id: string;
  supabaseUid: string;
  deletedAt: Date;
}

/** 유예 기간이 만료돼 실삭제 대상인 계정 목록. */
export async function findPurgeCandidates(now: Date = new Date()): Promise<PurgeCandidate[]> {
  const cutoff = new Date(now.getTime() - GRACE_MS);
  const rows = await getPrisma().user.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, supabaseUid: true, deletedAt: true },
  });
  return rows as PurgeCandidate[];
}

/**
 * 유예 만료 계정 실삭제. 순서가 중요하다:
 *   S3 prefix → Supabase Auth → DB(users 행, Cascade 로 자식 전부)
 * Auth 를 DB 보다 먼저 지워야, DB 만 지워진 상태에서 유효 토큰으로 재로그인해
 * 유저가 재생성되는 창을 최소화한다. 개별 실패는 기록하고 다음 계정으로 넘어간다.
 */
export async function purgeExpiredAccounts(
  now: Date = new Date(),
): Promise<{ purged: string[]; failed: string[] }> {
  const prisma = getPrisma();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const candidate of await findPurgeCandidates(now)) {
    try {
      await deleteObjectsByPrefix(`uploads/${candidate.id}/`);
      await deleteAuthUser(candidate.supabaseUid);
      await prisma.user.delete({ where: { id: candidate.id } });
      purged.push(candidate.id);
    } catch (err) {
      captureException(err, { userId: candidate.id, phase: 'account-purge' });
      failed.push(candidate.id);
    }
  }

  return { purged, failed };
}
