import type { UserProfile } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { captureException } from '../lib/sentry.js';
import { grantSignupBonus } from './credit.service.js';

/** 미들웨어에서 request.user에 담는 최소 정보 */
export interface AuthUser {
  id: string;
  supabaseUid: string;
  /** 계정 삭제 요청 시각. 유예 기간 중이면 값이 있고, 인증 미들웨어가 접근을 차단한다. */
  deletedAt: Date | null;
}

/**
 * Supabase UID로 앱 유저를 조회하고, 없으면 생성한다(첫 로그인 처리).
 * update: {} 이므로 삭제 대기(deletedAt) 상태를 되살리지 않는다 — 복구는 restoreAccount 로만.
 *
 * 플랜 개념은 없다 — 정기 구독을 제품 모델에서 제거했다
 * (docs/decisions/credit-payment-model.md).
 */
export async function resolveUser(supabaseUid: string): Promise<AuthUser> {
  const user = await getPrisma().user.upsert({
    where: { supabaseUid },
    update: {},
    create: { supabaseUid },
    select: { id: true, supabaseUid: true, deletedAt: true },
  });

  // 가입 보너스는 지급 여부를 원장으로 판정하므로 여기서 매번 호출해도 한 번만 들어간다.
  // 지급 실패가 로그인을 막아서는 안 된다 — 보고만 하고 통과시킨다.
  await grantSignupBonus(user.id).catch((err: unknown) => {
    captureException(err, { userId: user.id, at: 'grantSignupBonus' });
  });

  return {
    id: user.id,
    supabaseUid: user.supabaseUid,
    deletedAt: user.deletedAt,
  };
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      interests: true,
      notificationEnabled: true,
      quietStart: true,
      quietEnd: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    interests: user.interests,
    notificationEnabled: user.notificationEnabled,
    quietStart: user.quietStart,
    quietEnd: user.quietEnd,
  };
}

export interface ProfileUpdate {
  nickname?: string;
  avatarUrl?: string | null;
  interests?: string[];
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<UserProfile> {
  await getPrisma().user.update({
    where: { id: userId },
    data: {
      ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
    },
  });

  // update 직후 항상 존재하므로 non-null 단언 대신 재조회 결과를 그대로 반환
  return (await getProfile(userId))!;
}

/** 기기 교체를 고려해 항상 덮어쓴다(upsert 성격). */
export async function updateFcmToken(userId: string, fcmToken: string): Promise<void> {
  await getPrisma().user.update({
    where: { id: userId },
    data: { fcmToken },
  });
}
