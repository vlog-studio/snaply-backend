import type { LocationCategory, NearbyLocation } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { sendToUser, type PushMessage } from './fcm.service.js';

const COOLDOWN_MINUTES = 30;
const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export async function listNearby(params: {
  lat: number;
  lng: number;
  radius: number;
}): Promise<NearbyLocation[]> {
  const locations = await getPrisma().location.findMany({
    where: { isActive: true },
    select: { id: true, name: true, lat: true, lng: true, radiusMeters: true, category: true },
  });

  return locations
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      radiusMeters: loc.radiusMeters,
      category: (loc.category ?? '관광지') as LocationCategory,
      distanceMeters: Math.round(haversineMeters(params.lat, params.lng, loc.lat, loc.lng)),
    }))
    .filter((loc) => loc.distanceMeters <= params.radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** KST(UTC+9) 기준 현재 시각이 quiet_hours 구간인지 판정 (자정 넘김 지원). */
function isQuietNow(quietStart: number, quietEnd: number, now: Date): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (quietStart === quietEnd) {
    return false;
  }
  if (quietStart < quietEnd) {
    return kstHour >= quietStart && kstHour < quietEnd;
  }
  // 예: 22시~8시 (자정 넘김)
  return kstHour >= quietStart || kstHour < quietEnd;
}

export type GeofenceResult =
  | { notified: true }
  | {
      notified: false;
      reason: 'notifications_disabled' | 'quiet_hours' | 'cooldown' | 'no_token' | 'send_failed';
    };

export async function handleGeofenceEnter(params: {
  userId: string;
  locationId: string;
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
  now?: Date;
}): Promise<GeofenceResult> {
  const prisma = getPrisma();
  const now = params.now ?? new Date();

  const location = await prisma.location.findFirst({
    where: { id: params.locationId, isActive: true },
    select: { id: true, name: true, messageTemplate: true },
  });
  if (!location) {
    throw AppError.notFound('위치를 찾을 수 없습니다.');
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { notificationEnabled: true, quietStart: true, quietEnd: true },
  });
  if (!user) {
    throw AppError.notFound('유저를 찾을 수 없습니다.');
  }

  if (!user.notificationEnabled) {
    return { notified: false, reason: 'notifications_disabled' };
  }
  if (isQuietNow(user.quietStart, user.quietEnd, now)) {
    return { notified: false, reason: 'quiet_hours' };
  }

  // 30분 쿨다운: 같은 위치 최근 발송 이력 확인 (클라이언트 중복 호출 방지)
  //
  // "조회 후 기록"을 그냥 이어 쓰면 동시 요청이 모두 조회를 통과해 중복 발송된다.
  // (READ COMMITTED 라 INSERT ... WHERE NOT EXISTS 로도 막히지 않는다.)
  // 그래서 advisory lock 으로 (user, location) 단위 임계구역을 만들어 "선점 → 발송" 순서로 바꾼다.
  // xact 변종이라 커밋 시 자동 해제되고, Supabase 의 transaction-mode pgbouncer 와도 호환된다.
  const claim = await claimCooldownSlot(params.userId, location.id, now);
  if (!claim) {
    return { notified: false, reason: 'cooldown' };
  }

  const body = (location.messageTemplate ?? '{name}에서 기록을 남겨보세요!').replace(
    '{name}',
    location.name,
  );
  const message: PushMessage = {
    title: 'Snaply',
    body,
    data: { locationId: location.id },
  };

  const result = await sendToUser(params.logger, params.userId, message);
  if (!result.sent) {
    // 발송이 안 됐으면 선점한 슬롯을 되돌린다 → 쿨다운을 소모하지 않는다.
    await prisma.notificationLog.delete({ where: { id: claim.id } }).catch(() => undefined);
    // 발송 실패해도 예외 없이 결과만 반환 (라우트에서 200 유지)
    return { notified: false, reason: result.reason === 'no_token' ? 'no_token' : 'send_failed' };
  }

  return { notified: true };
}

/**
 * 쿨다운 슬롯을 원자적으로 선점한다.
 * 이미 최근 발송 이력이 있으면 null, 없으면 새로 만든 notification_logs 행을 반환.
 */
async function claimCooldownSlot(
  userId: string,
  locationId: string,
  now: Date,
): Promise<{ id: string } | null> {
  const since = new Date(now.getTime() - COOLDOWN_MINUTES * 60_000);
  const lockKey = `geofence:${userId}:${locationId}`;

  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const recent = await tx.notificationLog.findFirst({
      where: { userId, locationId, sentAt: { gte: since } },
      select: { id: true },
    });
    if (recent) {
      return null;
    }
    return tx.notificationLog.create({
      data: { userId, locationId, sentAt: now },
      select: { id: true },
    });
  });
}
