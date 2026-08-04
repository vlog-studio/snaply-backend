/**
 * Phase 6 — 위치 알림 시스템 (Dev B 트랙).
 * FCM은 서비스 계정 미설정 시 dry-run이므로, 발송 "판정" 로직 전체를 여기서 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { handleGeofenceEnter } from '../src/services/location.service.js';

let h: Harness;

/** 강남역 부근 */
const GANGNAM = { lat: 37.4979, lng: 127.0276 };

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

async function createLocation(
  overrides: Partial<{
    name: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    category: string;
    isActive: boolean;
    messageTemplate: string;
  }> = {},
): Promise<{ id: string; name: string }> {
  return h.prisma.location.create({
    data: {
      name: overrides.name ?? '테스트 장소',
      lat: overrides.lat ?? GANGNAM.lat,
      lng: overrides.lng ?? GANGNAM.lng,
      radiusMeters: overrides.radiusMeters ?? 500,
      category: overrides.category ?? '관광지',
      isActive: overrides.isActive ?? true,
      messageTemplate: overrides.messageTemplate ?? null,
    },
    select: { id: true, name: true },
  });
}

/**
 * 알림이 나갈 수 있는 상태로 유저를 준비한다.
 * quiet_hours 는 테스트 실행 "시각"에 좌우되므로 항상 명시적으로 지정한다.
 */
async function makeNotifiable(user: TestUser, opts: { quiet?: boolean } = {}): Promise<void> {
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  // quiet=true 면 지금 시각을 포함하는 1시간 구간, 아니면 2시간 뒤 구간
  const start = opts.quiet ? kstHour : (kstHour + 2) % 24;
  const quiet = { quietStart: start, quietEnd: (start + 1) % 24 };

  await h.app.inject({
    method: 'POST',
    url: '/auth/fcm-token',
    headers: user.auth,
    payload: { fcmToken: `fcm-test-${user.sub.slice(0, 8)}` },
  });
  await h.prisma.user.update({ where: { id: user.id }, data: quiet });
}

function enterGeofence(user: TestUser, locationId: string) {
  return h.app.inject({
    method: 'POST',
    url: '/notifications/geofence-enter',
    headers: user.auth,
    payload: { locationId },
  });
}

describe('GET /locations', () => {
  it('인증이 없으면 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/locations?lat=37.5&lng=127.0' });
    expect(res.statusCode).toBe(401);
  });

  it('lat/lng 가 없으면 400', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({ method: 'GET', url: '/locations', headers: user.auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('반경 안의 위치만 거리순으로 반환한다', async () => {
    const user = await h.createUser();
    // 강남역 기준: 가까운 곳 → 조금 먼 곳 → 반경 밖(부산)
    await createLocation({ name: '먼곳', lat: 37.5665, lng: 126.978 }); // 약 8.6km
    await createLocation({ name: '가까운곳', lat: 37.4989, lng: 127.0286 }); // 약 150m
    await createLocation({ name: '부산', lat: 35.1796, lng: 129.0756 });

    const res = await h.app.inject({
      method: 'GET',
      url: `/locations?lat=${GANGNAM.lat}&lng=${GANGNAM.lng}&radius=10000`,
      headers: user.auth,
    });

    expect(res.statusCode).toBe(200);
    const names = res.json().data.map((l: { name: string }) => l.name);
    expect(names).toEqual(['가까운곳', '먼곳']);
  });

  it('distanceMeters 가 실제 거리와 맞는다 (Haversine)', async () => {
    const user = await h.createUser();
    // 위도 0.009도 ≈ 1000m
    await createLocation({ name: '북쪽1km', lat: GANGNAM.lat + 0.009, lng: GANGNAM.lng });

    const res = await h.app.inject({
      method: 'GET',
      url: `/locations?lat=${GANGNAM.lat}&lng=${GANGNAM.lng}&radius=5000`,
      headers: user.auth,
    });

    const [loc] = res.json().data;
    expect(loc.distanceMeters).toBeGreaterThan(950);
    expect(loc.distanceMeters).toBeLessThan(1050);
  });

  it('비활성 위치는 제외한다', async () => {
    const user = await h.createUser();
    await createLocation({ name: '비활성', isActive: false });

    const res = await h.app.inject({
      method: 'GET',
      url: `/locations?lat=${GANGNAM.lat}&lng=${GANGNAM.lng}&radius=5000`,
      headers: user.auth,
    });
    expect(res.json().data).toEqual([]);
  });
});

describe('POST /notifications/geofence-enter', () => {
  it('인증이 없으면 401', async () => {
    const location = await createLocation();
    const res = await h.app.inject({
      method: 'POST',
      url: '/notifications/geofence-enter',
      payload: { locationId: location.id },
    });
    expect(res.statusCode).toBe(401);
  });

  it('없는 위치면 404', async () => {
    const user = await h.createUser();
    const res = await enterGeofence(user, randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it('첫 진입이면 발송하고 notification_logs 를 남긴다', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const location = await createLocation({ messageTemplate: '{name}에서 한 컷!' });

    const res = await enterGeofence(user, location.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ notified: true });
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(1);
  });

  it('30분 이내 같은 위치 재진입은 쿨다운으로 미발송', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const location = await createLocation();

    await enterGeofence(user, location.id);
    const second = await enterGeofence(user, location.id);

    expect(second.json().data).toEqual({ notified: false, reason: 'cooldown' });
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(1);
  });

  it('30분이 지나면 다시 발송한다', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const location = await createLocation();

    await enterGeofence(user, location.id);
    // 직전 발송 이력을 31분 전으로 되돌린다
    await h.prisma.notificationLog.updateMany({
      where: { userId: user.id },
      data: { sentAt: new Date(Date.now() - 31 * 60_000) },
    });

    const again = await enterGeofence(user, location.id);
    expect(again.json().data).toEqual({ notified: true });
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(2);
  });

  it('다른 위치는 쿨다운을 공유하지 않는다', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const a = await createLocation({ name: 'A' });
    const b = await createLocation({ name: 'B' });

    await enterGeofence(user, a.id);
    const res = await enterGeofence(user, b.id);

    expect(res.json().data).toEqual({ notified: true });
  });

  it('quiet_hours 구간이면 미발송', async () => {
    const user = await h.createUser();
    await makeNotifiable(user, { quiet: true });
    const location = await createLocation();

    const res = await enterGeofence(user, location.id);

    expect(res.json().data).toEqual({ notified: false, reason: 'quiet_hours' });
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('알림을 끈 유저면 미발송', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    await h.prisma.user.update({ where: { id: user.id }, data: { notificationEnabled: false } });
    const location = await createLocation();

    const res = await enterGeofence(user, location.id);

    expect(res.json().data).toEqual({ notified: false, reason: 'notifications_disabled' });
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('FCM 토큰이 없으면 미발송이고 로그도 남기지 않는다 (쿨다운 소모 안 함)', async () => {
    const user = await h.createUser();
    // fcmToken 을 등록하지 않는다
    const kstHour = (new Date().getUTCHours() + 9) % 24;
    await h.prisma.user.update({
      where: { id: user.id },
      data: { quietStart: (kstHour + 2) % 24, quietEnd: (kstHour + 3) % 24 },
    });
    const location = await createLocation();

    const res = await enterGeofence(user, location.id);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ notified: false, reason: 'no_token' });
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('토큰이 없어 발송 못 한 뒤 토큰을 등록하면 바로 발송된다 (쿨다운 미소모)', async () => {
    const user = await h.createUser();
    const kstHour = (new Date().getUTCHours() + 9) % 24;
    await h.prisma.user.update({
      where: { id: user.id },
      data: { quietStart: (kstHour + 2) % 24, quietEnd: (kstHour + 3) % 24 },
    });
    const location = await createLocation();

    const first = await enterGeofence(user, location.id);
    expect(first.json().data.reason).toBe('no_token');

    await h.app.inject({
      method: 'POST',
      url: '/auth/fcm-token',
      headers: user.auth,
      payload: { fcmToken: 'fcm-late' },
    });
    const second = await enterGeofence(user, location.id);

    expect(second.json().data).toEqual({ notified: true });
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(1);
  });

  it('동시에 여러 번 진입해도 한 번만 발송한다 (쿨다운 경합)', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const location = await createLocation();

    // 이 라우트는 토큰당 분당 10회 제한이므로 그 아래에서 동시 호출한다.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => enterGeofence(user, location.id)),
    );

    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const notified = results.filter((r) => r.json().data.notified === true);
    expect(notified).toHaveLength(1);
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(1);
  });

  it('서비스 계층을 직접 동시 호출해도 한 번만 기록된다 (인스턴스 다중화 대비)', async () => {
    const user = await h.createUser();
    await makeNotifiable(user);
    const location = await createLocation();
    const noopLogger = { info: () => undefined, warn: () => undefined };

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        handleGeofenceEnter({ userId: user.id, locationId: location.id, logger: noopLogger }),
      ),
    );

    expect(results.filter((r) => r.notified)).toHaveLength(1);
    expect(await h.prisma.notificationLog.count({ where: { userId: user.id } })).toBe(1);
  });
});
