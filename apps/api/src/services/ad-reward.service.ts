/**
 * 보상형 광고 크레딧.
 *
 * **지급의 유일한 트리거는 AdMob SSV 콜백이다.** 앱이 "광고를 봤으니 지급해달라"고 호출하는
 * 경로는 만들지 않는다 — 그 경로가 존재하는 순간 그것이 공격면이 된다
 * (docs/decisions/ad-reward-credits.md §3). 앱이 할 수 있는 것은 세션 발급 요청과 잔액·상태
 * 조회뿐이다.
 *
 * 지급량도 앱이나 콜백이 정하지 않는다. `reward_amount` 파라미터는 무시하고, **세션 발급
 * 시점에 스냅샷된 `ad_rewards.credits`** 를 지급한다. 정책이 중간에 바뀌어도 이미 시작된
 * 광고의 약속은 지켜지고, 파라미터를 조작해도 지급량은 변하지 않는다.
 *
 * 멱등성의 근거는 credit.service 와 같은 방식으로 DB 제약이다.
 *   - `ad_rewards.transaction_id` unique          : 같은 SSV 트랜잭션의 재전송
 *   - `credit_ledger(ad_reward_id, reason)` unique : 한 세션당 지급 1행
 * "이미 처리했는지" 를 먼저 조회해 분기하지 않는다. 재전송과 동시 요청이 조회와 삽입
 * 사이를 파고들기 때문이다.
 */
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AdMobConfig } from '../config.js';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import {
  adRewardDayEnd,
  adRewardDayStart,
  adRewardPolicy,
  CREDIT_REASON,
} from './billing/credit-policy.js';
import {
  parseSsvQuery,
  signedContentOf,
  verifySsvSignature,
  type SsvParams,
} from './billing/admob-ssv.js';

const UNIQUE_VIOLATION = 'P2002';

/**
 * SSV `timestamp` 허용 오차. 재전송 지연과 시계 오차를 덮되, 오래된 콜백을 무한정
 * 받아들이지는 않는 폭이다.
 */
const TIMESTAMP_SKEW_MS = 10 * 60_000;

export const AD_REWARD_STATUS = {
  pending: 'pending',
  /**
   * 앱이 결과를 확정적으로 알고(중도 이탈·노필) 슬롯을 스스로 비운 상태.
   * **지급 자격은 남는다** — 만료 전에 SSV 가 도착하면 그대로 지급한다
   * (docs/decisions/ad-reward-credits.md §4-1). 포기는 "다음 광고를 열 수 있게 하는 것"
   * 이지 "받은 보상을 버리는 것" 이 아니다.
   */
  abandoned: 'abandoned',
  granted: 'granted',
  expired: 'expired',
  rejected: 'rejected',
} as const;

/**
 * 아직 지급될 수 있는 상태. `pending` 만 다음 세션 발급을 막고, `abandoned` 는 슬롯을
 * 비운 채 SSV 를 기다린다.
 */
const GRANTABLE_STATUSES: string[] = [AD_REWARD_STATUS.pending, AD_REWARD_STATUS.abandoned];

export type AdRewardStatus = (typeof AD_REWARD_STATUS)[keyof typeof AD_REWARD_STATUS];

/** 거절 사유. 운영 진단용이며 앱에는 내리지 않는다 (VARCHAR(64) 안에 들어가야 한다). */
const REJECT = {
  invalidSignature: 'invalid_signature',
  staleTimestamp: 'stale_timestamp',
  sessionExpired: 'session_expired',
  userMismatch: 'user_mismatch',
  adUnitNotAllowed: 'ad_unit_not_allowed',
  dailyLimit: 'daily_limit',
  accountUnavailable: 'account_unavailable',
} as const;

export interface AdRewardAvailability {
  enabled: boolean;
  rewardCredits: number;
  dailyLimit: number;
  remainingToday: number;
  /** 쿨다운 중일 때만 채운다. null 이면 지금 가능. */
  nextAvailableAt: string | null;
  /** 일일 한도가 초기화되는 시각(KST 자정). */
  resetsAt: string;
}

export interface AdRewardSession {
  rewardId: string;
  nonce: string;
  ssvUserId: string;
  rewardCredits: number;
  expiresAt: string;
}

export interface AdRewardStatusDto {
  rewardId: string;
  status: AdRewardStatus;
  /** granted 일 때만 채운다. */
  credits: number | null;
  balance: number;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

/** 오늘(KST) 실제로 **지급된** 횟수. 발급만 되고 끝난 세션은 한도를 깎지 않는다. */
async function grantedToday(
  client: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  userId: string,
  now: Date,
): Promise<number> {
  return client.adReward.count({
    where: {
      userId,
      status: AD_REWARD_STATUS.granted,
      grantedAt: { gte: adRewardDayStart(now), lt: adRewardDayEnd(now) },
    },
  });
}

/** 쿨다운의 기준은 마지막 **지급** 시각이다. 시청을 시작만 한 것은 쿨다운을 걸지 않는다. */
async function lastGrantedAt(userId: string): Promise<Date | null> {
  const row = await getPrisma().adReward.findFirst({
    where: { userId, status: AD_REWARD_STATUS.granted, grantedAt: { not: null } },
    orderBy: { grantedAt: 'desc' },
    select: { grantedAt: true },
  });
  return row?.grantedAt ?? null;
}

/**
 * 만료된 세션(`pending`·`abandoned`)을 조회 시점에 정리한다.
 *
 * AdMob 이 실패한 콜백을 재전송한다고 가정하지 않으므로(§6), 유실된 세션은 배치가 없으면
 * 영원히 pending 으로 남아 다음 세션 발급을 막는다. 별도 배치를 두는 대신 읽는 쪽에서
 * lazy 하게 확정한다 — 상태를 보는 사람이 곧 그 상태에 막히는 사람이라 타이밍이 맞는다.
 */
async function expireStaleSessions(userId: string, now: Date): Promise<void> {
  await getPrisma().adReward.updateMany({
    where: { userId, status: { in: GRANTABLE_STATUSES }, expiresAt: { lt: now } },
    data: { status: AD_REWARD_STATUS.expired, rejectReason: REJECT.sessionExpired },
  });
}

/**
 * 앱이 "광고 보고 +N크레딧" 버튼의 표시·비활성·남은 횟수를 정하는 유일한 근거.
 * **앱은 보상량·한도·쿨다운을 하드코딩하지 않는다.**
 */
export async function getAvailability(userId: string): Promise<AdRewardAvailability> {
  const now = new Date();
  const policy = adRewardPolicy();
  await expireStaleSessions(userId, now);

  const [granted, lastGrant] = await Promise.all([
    grantedToday(getPrisma(), userId, now),
    lastGrantedAt(userId),
  ]);

  const cooldownUntil = lastGrant
    ? new Date(lastGrant.getTime() + policy.cooldownSeconds * 1000)
    : null;

  return {
    enabled: policy.enabled,
    rewardCredits: policy.credits,
    dailyLimit: policy.dailyLimit,
    remainingToday: Math.max(0, policy.dailyLimit - granted),
    nextAvailableAt:
      cooldownUntil && cooldownUntil > now ? cooldownUntil.toISOString() : null,
    resetsAt: adRewardDayEnd(now).toISOString(),
  };
}

/**
 * 보상 세션 발급. 앱이 광고를 **로드하기 직전에** 호출한다.
 *
 * `nonce` 는 SSV `custom_data` 로 왕복하는 비밀이고, `rewardId` 는 앱이 상태를 폴링하는
 * 공개 식별자다. 둘을 분리해 폴링 경로에 SSV 비밀이 노출되지 않게 한다.
 */
export async function createSession(userId: string): Promise<AdRewardSession> {
  const now = new Date();
  const policy = adRewardPolicy();
  if (!policy.enabled) {
    throw new AppError(503, 'AD_REWARDS_DISABLED', '광고 보상이 현재 비활성 상태입니다.');
  }

  await expireStaleSessions(userId, now);

  const active = await getPrisma().adReward.findFirst({
    where: { userId, status: AD_REWARD_STATUS.pending },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (active) {
    // 진행 중인 세션이 하나뿐이어야 세션 남발로 한도 계산을 흐리는 것을 막을 수 있다.
    throw new AppError(409, 'AD_REWARD_SESSION_ACTIVE', '진행 중인 광고 보상이 있습니다.', {
      rewardId: active.id,
    });
  }

  const granted = await grantedToday(getPrisma(), userId, now);
  if (granted >= policy.dailyLimit) {
    throw new AppError(409, 'AD_REWARD_LIMIT_REACHED', '오늘 받을 수 있는 광고 보상을 모두 받았습니다.', {
      resetsAt: adRewardDayEnd(now).toISOString(),
    });
  }

  const lastGrant = await lastGrantedAt(userId);
  if (lastGrant) {
    const nextAvailable = new Date(lastGrant.getTime() + policy.cooldownSeconds * 1000);
    if (nextAvailable > now) {
      throw new AppError(409, 'AD_REWARD_COOLDOWN', '다음 광고 보상까지 잠시 기다려 주세요.', {
        nextAvailableAt: nextAvailable.toISOString(),
      });
    }
  }

  const expiresAt = new Date(now.getTime() + policy.sessionTtlSeconds * 1000);
  const reward = await getPrisma().adReward.create({
    data: {
      userId,
      // 추측 가능한 값이면 남의 세션을 대신 확정시킬 수 있다.
      nonce: randomBytes(32).toString('base64url'),
      status: AD_REWARD_STATUS.pending,
      // 정책값 스냅샷. 이후 정책이 바뀌어도 이 세션의 지급량은 여기서 결정된다.
      credits: policy.credits,
      expiresAt,
    },
    select: { id: true, nonce: true, credits: true, expiresAt: true },
  });

  return {
    rewardId: reward.id,
    nonce: reward.nonce,
    // 값의 원천을 서버에 두면 나중에 가명화해도 앱 변경이 필요 없다.
    ssvUserId: userId,
    rewardCredits: reward.credits,
    expiresAt: reward.expiresAt.toISOString(),
  };
}

/** 세션 1건의 상태 응답. 남의 세션은 존재를 알리지 않도록 404 로 답한다. */
async function statusDto(userId: string, rewardId: string): Promise<AdRewardStatusDto> {
  const reward = await getPrisma().adReward.findFirst({
    where: { id: rewardId, userId },
    select: { id: true, status: true, credits: true },
  });
  if (!reward) {
    throw AppError.notFound('광고 보상을 찾을 수 없습니다.');
  }

  const agg = await getPrisma().creditLedger.aggregate({
    _sum: { delta: true },
    where: { userId },
  });

  return {
    rewardId: reward.id,
    status: reward.status as AdRewardStatus,
    credits: reward.status === AD_REWARD_STATUS.granted ? reward.credits : null,
    // 앱이 잔액 조회를 따로 하지 않도록 항상 함께 내린다.
    balance: agg._sum.delta ?? 0,
  };
}

/** 앱이 광고 닫힘 직후 짧게 폴링한다. */
export async function getSessionStatus(
  userId: string,
  rewardId: string,
): Promise<AdRewardStatusDto> {
  await expireStaleSessions(userId, new Date());
  return statusDto(userId, rewardId);
}

/**
 * 세션 포기. 앱이 SDK 로부터 **결과가 확정됐음**(사용자 중도 이탈·노필·로드 실패)을 알았을 때
 * 호출해 진행 중 슬롯을 즉시 비운다. TTL 이 끝나기를 기다릴 이유가 없기 때문이다
 * (docs/decisions/ad-reward-credits.md §4-1).
 *
 * 새 공격면이 되지 않는 이유: 이 경로는 지급을 **만들지 못한다.** 할 수 있는 것은 자기 세션의
 * 슬롯을 비우는 것뿐이고, 그건 호출한 사용자에게 손해일 뿐이라 악용할 동기가 없다.
 *
 * SSV 와의 경합은 **지급 우선**으로 정했다. 포기는 슬롯만 비우고 지급 자격은 남기므로,
 * 만료 전에 도착한 콜백은 그대로 지급된다 — 사용자는 실제로 광고를 봤을 수 있다.
 * 이래도 하루 지급 횟수는 지급 시점의 한도 재확인이 막는다.
 *
 * 멱등이다. 이미 확정된(granted·expired·rejected) 세션이나 이미 포기한 세션에 다시 호출해도
 * 현재 상태를 그대로 돌려준다 — 앱이 재시도를 특별히 다루지 않아도 된다.
 */
export async function abandonSession(
  userId: string,
  rewardId: string,
): Promise<AdRewardStatusDto> {
  const now = new Date();
  await expireStaleSessions(userId, now);

  await getPrisma().adReward.updateMany({
    // pending 만 바꾼다. granted 를 되돌리거나 만료를 덮어쓰지 않는다.
    where: { id: rewardId, userId, status: AD_REWARD_STATUS.pending },
    data: { status: AD_REWARD_STATUS.abandoned },
  });

  return statusDto(userId, rewardId);
}

// ── SSV 콜백 ────────────────────────────────────────────

/**
 * 세션을 거절로 확정한다.
 *
 * 서명 검증에 실패한 요청까지 세션을 건드리는 것은 얼핏 위험해 보이지만, 여기까지 오려면
 * 공격자가 이미 그 세션의 `nonce` 를 알고 있어야 한다(=단말에서 유출된 상태). 그 상황에서
 * 잃는 것은 보상 1회의 재시도뿐이고, 얻는 것은 "왜 지급되지 않았는가" 를 운영이 사후에
 * 답할 수 있다는 점이다.
 */
async function rejectSession(
  rewardId: string,
  reason: string,
  /**
   * 수신한 `ad_unit`. **검증되지 않은 값이며 진단용으로만 남긴다** — 지급 판단에는 쓰지
   * 않는다. 이걸 저장하지 않으면 `ad_unit_not_allowed` 가 났을 때 "AdMob 이 실제로 뭘
   * 보냈는지" 를 DB 만 보고 알 수 없어, 허용 목록의 형식 문제를 로그 없이는 못 고친다
   * (콜백의 `ad_unit` 이 전체 ID 인지 숫자 부분인지 문서가 못 박지 않았다 — backlog C-6).
   */
  adUnit?: string | null,
): Promise<void> {
  await getPrisma().adReward.updateMany({
    where: { id: rewardId, status: { in: GRANTABLE_STATUSES } },
    data: {
      status: AD_REWARD_STATUS.rejected,
      rejectReason: reason,
      // 길이를 넘는 값이 오면 컬럼 제약에 걸려 거절 기록 자체가 실패한다. 진단용이므로 자른다.
      ...(adUnit ? { adUnit: adUnit.slice(0, 64) } : {}),
    },
  });
}

function ssvRejected(message: string): AppError {
  // 200 으로 삼키지 않는다 — 검증 실패는 우리 쪽 로그가 아니라 AdMob 쪽에도 남아야 한다.
  return new AppError(400, 'AD_REWARD_REJECTED', message);
}

function requiredParams(params: SsvParams): boolean {
  return Boolean(
    params.signature && params.keyId && params.customData && params.transactionId && params.userId,
  );
}

/**
 * AdMob SSV 콜백 처리.
 *
 * `rawQuery` 는 **수신한 쿼리스트링 원문**이어야 한다. 서명 대상이 `&signature=` 직전까지의
 * 원문이라, 파싱 후 재조립한 문자열을 넘기면 인코딩 차이만으로 정상 콜백이 위조로 판정된다.
 */
export async function handleSsvCallback(params: {
  config: AdMobConfig;
  rawQuery: string;
}): Promise<void> {
  const query = new URLSearchParams(params.rawQuery);
  const ssv = parseSsvQuery(query);
  const signedContent = signedContentOf(params.rawQuery);
  if (!signedContent || !requiredParams(ssv)) {
    throw AppError.badRequest('SSV 파라미터가 올바르지 않습니다.');
  }

  const reward = await getPrisma().adReward.findUnique({
    where: { nonce: ssv.customData as string },
    select: {
      id: true,
      userId: true,
      status: true,
      credits: true,
      expiresAt: true,
      user: { select: { deletedAt: true } },
    },
  });
  if (!reward) {
    // 우리가 발급한 적 없는 세션 — 남길 것도 없다.
    throw ssvRejected('알 수 없는 보상 세션입니다.');
  }

  // 재전송. 이미 확정된 세션은 다시 지급하지 않고 200 으로 답해 재시도를 끊는다.
  if (reward.status === AD_REWARD_STATUS.granted) {
    return;
  }
  if (!GRANTABLE_STATUSES.includes(reward.status)) {
    throw ssvRejected('이미 종료된 보상 세션입니다.');
  }

  const verified = await verifySsvSignature({
    config: params.config,
    signedContent,
    signature: ssv.signature as string,
    keyId: ssv.keyId as string,
  });
  if (!verified) {
    await rejectSession(reward.id, REJECT.invalidSignature, ssv.adUnit);
    throw ssvRejected('서명 검증에 실패했습니다.');
  }

  const now = new Date();
  if (!ssv.timestampMs || Math.abs(now.getTime() - ssv.timestampMs) > TIMESTAMP_SKEW_MS) {
    await rejectSession(reward.id, REJECT.staleTimestamp, ssv.adUnit);
    throw ssvRejected('콜백 시각이 허용 범위를 벗어났습니다.');
  }
  if (reward.expiresAt < now) {
    await rejectSession(reward.id, REJECT.sessionExpired, ssv.adUnit);
    throw ssvRejected('만료된 보상 세션입니다.');
  }
  if (ssv.userId !== reward.userId) {
    await rejectSession(reward.id, REJECT.userMismatch, ssv.adUnit);
    throw ssvRejected('보상 세션의 사용자와 일치하지 않습니다.');
  }
  // 허용 목록이 비어 있으면 아무 것도 통과하지 못한다 — 지급 경로를 "설정 안 함 = 전부 허용"
  // 으로 열지 않는다.
  if (!ssv.adUnit || !params.config.allowedAdUnits.includes(ssv.adUnit)) {
    await rejectSession(reward.id, REJECT.adUnitNotAllowed, ssv.adUnit);
    throw ssvRejected('허용되지 않은 광고 단위입니다.');
  }
  if (reward.user.deletedAt) {
    await rejectSession(reward.id, REJECT.accountUnavailable, ssv.adUnit);
    throw ssvRejected('지급할 수 없는 계정 상태입니다.');
  }
  // 세션 발급 이후 다른 세션이 지급됐을 수 있으므로 한도를 지급 시점에 다시 센다.
  if ((await grantedToday(getPrisma(), reward.userId, now)) >= adRewardPolicy().dailyLimit) {
    await rejectSession(reward.id, REJECT.dailyLimit, ssv.adUnit);
    throw ssvRejected('오늘의 광고 보상 한도를 초과했습니다.');
  }

  await grant({
    rewardId: reward.id,
    userId: reward.userId,
    credits: reward.credits,
    transactionId: ssv.transactionId as string,
    adUnit: ssv.adUnit,
    now,
  });
}

/**
 * 상태 전이와 원장 기록을 한 트랜잭션에 묶는다 — 근거는 `export_reserve` 와 같다.
 * 지급됐는데 세션이 pending 으로 남거나 그 반대가 되는 상태를 만들지 않는다.
 */
async function grant(params: {
  rewardId: string;
  userId: string;
  credits: number;
  transactionId: string;
  adUnit: string;
  now: Date;
}): Promise<void> {
  try {
    await getPrisma().$transaction(async (tx) => {
      // status 전이를 조건으로 걸어, 동시에 도착한 두 번째 콜백이 통과하지 못하게 한다.
      const updated = await tx.adReward.updateMany({
        where: { id: params.rewardId, status: { in: GRANTABLE_STATUSES } },
        data: {
          status: AD_REWARD_STATUS.granted,
          transactionId: params.transactionId,
          adUnit: params.adUnit,
          grantedAt: params.now,
        },
      });
      if (updated.count === 0) {
        return; // 이미 다른 요청이 확정했다
      }
      await tx.creditLedger.create({
        data: {
          userId: params.userId,
          delta: params.credits,
          reason: CREDIT_REASON.adReward,
          adRewardId: params.rewardId,
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // 같은 transaction_id 가 다른 세션으로 왔거나 지급 행이 이미 있다 = 이미 처리된 콜백.
      // 재시도를 시켜 봐야 결과가 같으므로 성공(200)으로 답한다.
      return;
    }
    throw err;
  }
}
