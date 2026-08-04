/**
 * Phase 6 — FCM 발송 계층 (Dev B 트랙).
 *
 * 실제 서비스 계정이 있어도 실기기 토큰(FE 앱) 없이는 수신 확인이 안 되므로,
 * firebase-admin 을 대체해 "우리 쪽 분기"를 검증한다:
 *   dry-run 전환 · 무효 토큰 자동 정리 · 일시 오류 시 토큰 보존 · 중복 초기화 안전성
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const send = vi.fn();
const initializeApp = vi.fn(() => ({ name: 'snaply' }));
const cert = vi.fn((c: unknown) => c);
const apps: ({ name: string } | null)[] = [];

vi.mock('firebase-admin', () => ({
  default: {
    get apps() {
      return apps;
    },
    initializeApp: (...args: unknown[]) => {
      const created = initializeApp(...(args as []));
      apps.push(created);
      return created;
    },
    credential: { cert: (c: unknown) => cert(c) },
    messaging: () => ({ send }),
  },
}));

// 실제 인증서 검증을 타지 않도록 mock 을 걸었으므로, 형태만 갖춘 JSON 으로 충분하다.
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'snaply-test',
  client_email: 'sa@snaply-test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
});

const { createHarness } = await import('./helpers/harness.js');
const { initFcm, sendToUser, isFcmDryRun } = await import('../src/services/fcm.service.js');
type Harness = Awaited<ReturnType<typeof createHarness>>;

let h: Harness;
const logger = { info: vi.fn(), warn: vi.fn() };

beforeAll(async () => {
  h = await createHarness({ FIREBASE_SERVICE_ACCOUNT_KEY: SERVICE_ACCOUNT });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
  send.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
});

const message = { title: 'Snaply', body: '테스트 알림' };

async function userWithToken(token: string | null) {
  const user = await h.createUser();
  if (token !== null) {
    await h.prisma.user.update({ where: { id: user.id }, data: { fcmToken: token } });
  }
  return user;
}

describe('서비스 계정 설정', () => {
  it('서비스 계정이 있으면 dry-run 이 아니다', () => {
    initFcm({ projectId: 'snaply-test', serviceAccountJson: SERVICE_ACCOUNT });
    expect(isFcmDryRun()).toBe(false);
  });

  it('서비스 계정이 없으면 dry-run', () => {
    initFcm({ projectId: undefined, serviceAccountJson: undefined });
    expect(isFcmDryRun()).toBe(true);
  });

  it('서비스 계정 JSON 이 깨져 있으면 발송을 막지 않고 dry-run 으로 떨어진다', () => {
    initFcm({ projectId: undefined, serviceAccountJson: '{ 이건 JSON 이 아님' });
    expect(isFcmDryRun()).toBe(true);
  });

  it('두 번 초기화해도 예외 없이 같은 앱을 재사용한다 (duplicate-app 방지)', () => {
    initializeApp.mockClear();
    initFcm({ projectId: 'p', serviceAccountJson: SERVICE_ACCOUNT });
    const firstCallCount = initializeApp.mock.calls.length;

    expect(() => initFcm({ projectId: 'p', serviceAccountJson: SERVICE_ACCOUNT })).not.toThrow();
    // 두 번째는 새로 만들지 않는다
    expect(initializeApp.mock.calls.length).toBe(firstCallCount);
    expect(isFcmDryRun()).toBe(false);
  });
});

describe('sendToUser', () => {
  beforeEach(() => {
    initFcm({ projectId: 'snaply-test', serviceAccountJson: SERVICE_ACCOUNT });
  });

  it('토큰이 없으면 호출하지 않고 no_token', async () => {
    const user = await userWithToken(null);

    const result = await sendToUser(logger, user.id, message);

    expect(result).toEqual({ sent: false, reason: 'no_token' });
    expect(send).not.toHaveBeenCalled();
  });

  it('정상 발송하면 토큰과 알림 내용을 그대로 넘긴다', async () => {
    const user = await userWithToken('device-token-1');
    send.mockResolvedValue('projects/snaply/messages/abc');

    const result = await sendToUser(logger, user.id, {
      ...message,
      data: { locationId: 'loc-1' },
    });

    expect(result).toEqual({ sent: true, dryRun: false });
    expect(send).toHaveBeenCalledWith({
      token: 'device-token-1',
      notification: { title: 'Snaply', body: '테스트 알림' },
      data: { locationId: 'loc-1' },
    });
  });

  it('앱 재설치 등으로 토큰이 무효면 DB 에서 정리한다', async () => {
    const user = await userWithToken('stale-token');
    send.mockRejectedValue({
      errorInfo: { code: 'messaging/registration-token-not-registered' },
    });

    const result = await sendToUser(logger, user.id, message);

    expect(result).toEqual({ sent: false, reason: 'token_invalid' });
    const after = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.fcmToken).toBeNull();
  });

  it('일시적인 오류면 토큰을 지우지 않는다', async () => {
    const user = await userWithToken('good-token');
    send.mockRejectedValue({ errorInfo: { code: 'messaging/internal-error' } });

    const result = await sendToUser(logger, user.id, message);

    expect(result).toEqual({ sent: false, reason: 'send_error' });
    const after = await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.fcmToken).toBe('good-token'); // 보존
    expect(logger.warn).toHaveBeenCalled();
  });

  it('errorInfo 없이 code 만 있는 에러도 처리한다', async () => {
    const user = await userWithToken('stale-2');
    send.mockRejectedValue({ code: 'messaging/registration-token-not-registered' });

    const result = await sendToUser(logger, user.id, message);

    expect(result).toEqual({ sent: false, reason: 'token_invalid' });
    expect((await h.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).fcmToken).toBeNull();
  });

  it('dry-run 이면 실제 발송하지 않고 로그만 남긴다', async () => {
    initFcm({ projectId: undefined, serviceAccountJson: undefined });
    const user = await userWithToken('device-token-2');

    const result = await sendToUser(logger, user.id, message);

    expect(result).toEqual({ sent: true, dryRun: true });
    expect(send).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });
});

describe('geofence 연동', () => {
  it('무효 토큰이 정리되면 다음 진입은 no_token 이 된다', async () => {
    initFcm({ projectId: 'snaply-test', serviceAccountJson: SERVICE_ACCOUNT });
    const user = await userWithToken('will-be-removed');
    const kstHour = (new Date().getUTCHours() + 9) % 24;
    await h.prisma.user.update({
      where: { id: user.id },
      data: { quietStart: (kstHour + 2) % 24, quietEnd: (kstHour + 3) % 24 },
    });
    const location = await h.prisma.location.create({
      data: { name: 'fcm-geo', lat: 37.5, lng: 127.0 },
      select: { id: true },
    });
    send.mockRejectedValue({
      errorInfo: { code: 'messaging/registration-token-not-registered' },
    });

    const first = await h.app.inject({
      method: 'POST',
      url: '/notifications/geofence-enter',
      headers: user.auth,
      payload: { locationId: location.id },
    });
    const second = await h.app.inject({
      method: 'POST',
      url: '/notifications/geofence-enter',
      headers: user.auth,
      payload: { locationId: location.id },
    });

    // 발송 실패라 200 은 유지하고 쿨다운도 소모하지 않는다
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toEqual({ notified: false, reason: 'send_failed' });
    expect(second.json().data).toEqual({ notified: false, reason: 'no_token' });
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });
});
