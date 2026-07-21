import type { Plan, UserProfile } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';

/** 미들웨어에서 request.user에 담는 최소 정보 */
export interface AuthUser {
  id: string;
  supabaseUid: string;
  plan: Plan;
}

/**
 * Supabase UID로 앱 유저를 조회하고, 없으면 생성한다(첫 로그인 처리).
 * plan은 subscriptions 테이블 기준이며, 구독이 없으면 'free'.
 */
export async function resolveUser(supabaseUid: string): Promise<AuthUser> {
  const user = await getPrisma().user.upsert({
    where: { supabaseUid },
    update: {},
    create: { supabaseUid },
    select: {
      id: true,
      supabaseUid: true,
      subscription: { select: { plan: true } },
    },
  });

  return {
    id: user.id,
    supabaseUid: user.supabaseUid,
    plan: (user.subscription?.plan as Plan | undefined) ?? 'free',
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
      subscription: { select: { plan: true } },
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
    plan: (user.subscription?.plan as Plan | undefined) ?? 'free',
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
