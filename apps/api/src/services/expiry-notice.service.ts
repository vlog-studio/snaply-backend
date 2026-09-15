/**
 * 스냅 만료 예고 알림 (SNAP-13).
 *
 * 유예 기간을 두지 않기로 한 결정(`EXPIRY_TO_PURGE_DAYS = 0`)이 성립하려면 **삭제 전에
 * 알렸어야 한다.** 그래서 이 모듈은 부가 기능이 아니라 삭제 정책의 나머지 절반이다.
 *
 * 세 가지를 지킨다.
 *
 * - **두 번 보내지 않는다.** 발송 전에 `notification_logs` 행을 선점하고, 실패하면 지운다.
 *   유니크 제약이 DB 수준에서 막으므로 배치가 하루에 두 번 돌아도 중복되지 않는다.
 * - **밀린 예고도 보낸다.** "정확히 D-3 인 스냅" 이 아니라 "D-3 을 지났는데 아직 안 보낸
 *   스냅" 을 찾는다. 배치가 하루 쉬어도 예고가 통째로 증발하지 않는다.
 * - **못 보낸 것을 보냈다고 하지 않는다.** FCM dry-run(운영에 서비스 계정 미주입)은
 *   `sendToUser` 가 성공으로 돌려주지만, 여기서는 선점을 되돌려 다음 실행에서 다시 시도한다.
 */
import { getPrisma } from '../db/client.js';
import { captureException } from '../lib/sentry.js';
import { isFcmDryRun, sendToUser } from './fcm.service.js';
import {
  SNAP_EXPIRY_NOTICE_DAYS,
  SNAP_RETENTION_DAYS,
  cutoffFor,
} from './retention-policy.js';

interface Logger {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
}

export interface NoticeOutcome {
  /** 알림을 보낸 사용자 수 */
  notified: number;
  /** 예고한 스냅 수 */
  videos: number;
  /** 보내지 않은 이유별 사용자 수 */
  skipped: Record<string, number>;
}

/** 예고 대상: 아직 살아 있고, D-`daysBefore` 를 지났고, 그 예고를 아직 못 받은 스냅. */
async function findDueSnaps(daysBefore: number, now: Date) {
  return await getPrisma().video.findMany({
    where: {
      kind: 'source',
      status: 'ready',
      deletedAt: null,
      createdAt: {
        // D-`daysBefore` 를 지났다 — "정확히 그날" 이 아니라 "지났다" 이므로, 배치가 하루
        // 쉬어도 밀린 예고가 걸린다.
        lte: cutoffFor(SNAP_RETENTION_DAYS - daysBefore, now),
        // 아직 만료되지는 않았다. 오늘 지워질 것에 "곧 지워집니다" 를 보내지 않는다.
        gt: cutoffFor(SNAP_RETENTION_DAYS, now),
      },
      notificationLogs: { none: { noticeDaysBefore: daysBefore } },
    },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 사용자가 이 알림을 받을 수 있는 상태인가.
 *
 * **조용한 시간대는 여기서 보지 않는다.** 배치를 낮에 돌려 애초에 그 구간을 피하기
 * 때문이다(`EXPIRY_NOTICE_HOUR_KST`). 시간으로 거르면 걸린 알림이 그냥 사라지는데,
 * 만료 예고는 사라지면 사용자가 파일을 잃는다.
 *
 * **이 알림에는 종류별 스위치가 없다.** 끌 수 있게 하면 사용자가 모르는 채로 영상을 잃는데,
 * 만료에 유예가 없는 근거가 "미리 알린다" 였다(docs/decisions/notification-preferences.md).
 * 푸시 전체를 끈 사용자에게만 가지 않으며, 그때는 라이브러리 화면의 남은 기간 표시(SNAP-13)가
 * 유일한 안내다.
 */
async function canNotify(userId: string): Promise<boolean> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { notificationEnabled: true, deletedAt: true },
  });
  return Boolean(user && user.notificationEnabled && !user.deletedAt);
}

function messageFor(daysBefore: number, count: number): { title: string; body: string } {
  const when = daysBefore === 1 ? '내일' : `${daysBefore}일 후`;
  const what = count === 1 ? '영상 1개가' : `영상 ${count}개가`;
  return {
    title: 'Snaply',
    // 되돌릴 수 없다는 것과, 지금 무엇을 하면 되는지를 같이 말한다.
    body: `${when} ${what} 보관 기간이 끝나 삭제됩니다. 남기고 싶다면 브이로그로 만들어 주세요.`,
  };
}

/**
 * 만료 예고를 발송한다. `apply` 가 false 면 대상만 세고 보내지 않는다(dry-run).
 *
 * 사용자당 한 번만 보낸다 — 스냅 5개가 같은 날 만료된다고 알림 5개를 보내면 사용자는
 * 알림을 끈다. 기록은 스냅별로 남겨 다음 실행이 같은 스냅을 다시 세지 않게 한다.
 */
export async function sendExpiryNotices(params: {
  logger: Logger;
  now?: Date;
  apply?: boolean;
}): Promise<NoticeOutcome> {
  const now = params.now ?? new Date();
  const apply = params.apply ?? false;
  const prisma = getPrisma();
  const outcome: NoticeOutcome = { notified: 0, videos: 0, skipped: {} };
  const skip = (reason: string): void => {
    outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
  };

  for (const daysBefore of SNAP_EXPIRY_NOTICE_DAYS) {
    const due = await findDueSnaps(daysBefore, now);
    const byUser = new Map<string, string[]>();
    for (const video of due) {
      byUser.set(video.userId, [...(byUser.get(video.userId) ?? []), video.id]);
    }

    for (const [userId, videoIds] of byUser) {
      if (!(await canNotify(userId))) {
        skip('notifications_disabled');
        continue;
      }
      if (!apply) {
        outcome.notified += 1;
        outcome.videos += videoIds.length;
        continue;
      }

      // 발송보다 먼저 선점한다. 여기서 실패하면(경합) 다른 실행이 이미 보내는 중이다.
      let claimed: string[];
      try {
        await prisma.notificationLog.createMany({
          data: videoIds.map((videoId) => ({
            userId,
            kind: 'snap_expiry' as const,
            videoId,
            noticeDaysBefore: daysBefore,
          })),
          skipDuplicates: true,
        });
        claimed = videoIds;
      } catch (err) {
        captureException(err, { userId, daysBefore, phase: 'expiry-notice-claim' });
        skip('claim_failed');
        continue;
      }

      const result = await sendToUser(params.logger, userId, {
        ...messageFor(daysBefore, claimed.length),
        data: { kind: 'snap_expiry', daysBefore: String(daysBefore) },
      });

      // dry-run 은 보낸 것이 아니다. 성공으로 기록하면 운영 설정 누락이 초록불로 보인다.
      const delivered = result.sent && !result.dryRun;
      if (!delivered) {
        await prisma.notificationLog
          .deleteMany({
            where: { userId, noticeDaysBefore: daysBefore, videoId: { in: claimed } },
          })
          .catch(() => undefined);
        skip(result.sent ? 'dry_run' : result.reason);
        continue;
      }

      outcome.notified += 1;
      outcome.videos += claimed.length;
    }
  }

  if (apply && isFcmDryRun()) {
    params.logger.warn(
      { skipped: outcome.skipped },
      'FCM 이 dry-run 이라 만료 예고가 실제로 발송되지 않았다 — 서비스 계정을 확인할 것',
    );
  }
  return outcome;
}
