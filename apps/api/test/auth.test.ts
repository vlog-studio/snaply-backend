/**
 * Phase 2 — 인증 미들웨어.
 * 공통 소유 영역이지만, 모든 트랙의 테스트가 이 경로 위에서 돌기 때문에 여기서 먼저 고정한다.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createHarness, type Harness } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('GET /health', () => {
  it('DB 연결까지 확인해 ok 를 반환한다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'ok', db: 'connected' });
  });
});

describe('GET /auth/me', () => {
  it('토큰이 없으면 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('서명이 깨진 토큰이면 401', async () => {
    const token = await h.stub.mint();
    const res = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}tampered` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('만료된 토큰이면 401', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${await h.stub.mintExpired()}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('audience 가 다르면 401', async () => {
    const token = await h.stub.mint({ audience: 'other-audience' });
    const res = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('첫 로그인이면 users 행을 자동 생성한다 (JIT)', async () => {
    const sub = randomUUID();
    expect(await h.prisma.user.findUnique({ where: { supabaseUid: sub } })).toBeNull();

    const token = await h.stub.mint({ sub });
    const res = await h.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ notificationEnabled: true });
    expect(await h.prisma.user.findUnique({ where: { supabaseUid: sub } })).not.toBeNull();
  });

  it('같은 sub 로 다시 호출해도 유저가 중복 생성되지 않는다 (멱등)', async () => {
    const sub = randomUUID();
    const user1 = await h.createUser({ sub });
    const user2 = await h.createUser({ sub });

    expect(user2.id).toBe(user1.id);
    expect(await h.prisma.user.count({ where: { supabaseUid: sub } })).toBe(1);
  });

  /**
   * 첫 로그인 직후 앱은 템플릿·크레딧·무비 요청을 한꺼번에 보낸다. Prisma 의 upsert 는
   * 원자적이지 않아 같은 sub 의 create 가 경합하고, 지는 쪽이 P2002 로 500 을 받았다
   * (2026-09-23 iOS 시뮬레이터 검증에서 /movies 가 실패). 유니크 위반은 다시 읽어 흡수해야 한다.
   */
  describe('첫 로그인 경합', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('upsert 가 유니크 위반으로 실패해도 기존 행을 읽어 200 을 돌려준다', async () => {
      const sub = randomUUID();
      await h.createUser({ sub });

      // 경합에서 진 쪽이 받는 에러를 그대로 흉내 낸다.
      const violation = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`supabase_uid`)',
        { code: 'P2002', clientVersion: Prisma.prismaVersion.client, meta: { target: ['supabase_uid'] } },
      );
      const upsert = vi.spyOn(h.prisma.user, 'upsert').mockRejectedValueOnce(violation);

      const res = await h.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${await h.stub.mint({ sub })}` },
      });

      expect(upsert).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
      expect(await h.prisma.user.count({ where: { supabaseUid: sub } })).toBe(1);
    });

    it('유니크 위반이 아닌 에러는 그대로 전파한다', async () => {
      const sub = randomUUID();
      vi.spyOn(h.prisma.user, 'upsert').mockRejectedValueOnce(new Error('connection lost'));

      const res = await h.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${await h.stub.mint({ sub })}` },
      });

      expect(res.statusCode).toBe(500);
      expect(await h.prisma.user.count({ where: { supabaseUid: sub } })).toBe(0);
    });

    it('같은 sub 의 첫 요청 여러 개가 동시에 와도 모두 200 이고 유저는 하나다', async () => {
      const sub = randomUUID();
      const token = await h.stub.mint({ sub });

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          h.app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } }),
        ),
      );

      expect(responses.map((r) => r.statusCode)).toEqual(Array(6).fill(200));
      expect(await h.prisma.user.count({ where: { supabaseUid: sub } })).toBe(1);
    });
  });
});

/**
 * 알림 설정의 서버 반영 (backlog B-6).
 *
 * 앱에는 종류별 스위치가 있었지만 기기에만 저장돼서, **사용자가 끈 알림을 서버가 계속
 * 보냈다.** 이 엔드포인트가 그 스위치가 실제로 사는 곳이다.
 */
describe('PATCH /auth/me — 알림 설정', () => {
  it('종류별 스위치와 방해 금지 시간을 저장하고 되돌려준다', async () => {
    const user = await h.createUser();

    const res = await h.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: user.auth,
      payload: {
        notificationEnabled: true,
        locationNotificationEnabled: false,
        movieNotificationEnabled: true,
        quietStart: 23,
        quietEnd: 7,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      notificationEnabled: true,
      locationNotificationEnabled: false,
      movieNotificationEnabled: true,
      quietStart: 23,
      quietEnd: 7,
    });

    const saved = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.locationNotificationEnabled).toBe(false);
    expect(saved.quietStart).toBe(23);
  });

  it('보낸 필드만 바꾼다 — 닉네임만 보내도 알림 설정이 초기화되지 않는다', async () => {
    const user = await h.createUser();
    await h.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: user.auth,
      payload: { movieNotificationEnabled: false },
    });

    const res = await h.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: user.auth,
      payload: { nickname: '다연' },
    });

    expect(res.json().data).toMatchObject({ nickname: '다연', movieNotificationEnabled: false });
  });

  it('기본값은 전부 켜짐이다 — 설정한 적 없는 사용자에게는 알림이 간다', async () => {
    const user = await h.createUser();

    const res = await h.app.inject({ method: 'GET', url: '/auth/me', headers: user.auth });

    expect(res.json().data).toMatchObject({
      notificationEnabled: true,
      locationNotificationEnabled: true,
      movieNotificationEnabled: true,
    });
  });

  it('시각이 0~23 을 벗어나면 400', async () => {
    const user = await h.createUser();

    for (const payload of [{ quietStart: 24 }, { quietEnd: -1 }]) {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/auth/me',
        headers: user.auth,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
