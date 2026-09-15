/**
 * Phase 2 — 인증 미들웨어.
 * 공통 소유 영역이지만, 모든 트랙의 테스트가 이 경로 위에서 돌기 때문에 여기서 먼저 고정한다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
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
