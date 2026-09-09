/**
 * 스냅 만료 예고 알림 (SNAP-13).
 *
 * 이 알림은 부가 기능이 아니다 — 유예 기간을 두지 않기로 한 결정(`EXPIRY_TO_PURGE_DAYS = 0`)이
 * 성립하려면 삭제 전에 알렸어야 하고, 그래서 **못 보낸 것을 보냈다고 기록하지 않는 것**이
 * 여기서 제일 중요한 성질이다. dry-run 이 성공으로 기록되면 운영에 서비스 계정이 빠져도
 * 배치는 "전원 발송 완료" 라고 말하면서 파일을 지운다.
 *
 * firebase-admin 은 실기기 토큰 없이 수신을 확인할 수 없으므로 `fcm.test.ts` 와 같은 방식으로
 * 대체하고, 우리 쪽 분기(선점·중복·되돌리기)만 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const send = vi.fn();
const apps: ({ name: string } | null)[] = [];

vi.mock('firebase-admin', () => ({
  default: {
    get apps() {
      return apps;
    },
    initializeApp: (_c: unknown, name: string) => {
      const created = { name };
      apps.push(created);
      return created;
    },
    credential: { cert: (c: unknown) => c },
    messaging: () => ({ send }),
  },
}));

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'snaply-test',
  client_email: 'sa@snaply-test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
});

const { createHarness } = await import('./helpers/harness.js');
const { initFcm } = await import('../src/services/fcm.service.js');
const { sendExpiryNotices } = await import('../src/services/expiry-notice.service.js');
const { SNAP_RETENTION_DAYS } = await import('../src/services/retention-policy.js');
type Harness = Awaited<ReturnType<typeof createHarness>>;

let h: Harness;
const logger = { info: vi.fn(), warn: vi.fn() };

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-09T01:00:00.000Z');

/** 오늘 기준 `ageDays` 일 전에 올라온 스냅. */
async function snapUploadedDaysAgo(userId: string, ageDays: number) {
  return h.prisma.video.create({
    data: {
      userId,
      kind: 'source',
      status: 'ready',
      originalUrls: [],
      createdAt: new Date(now.getTime() - ageDays * DAY_MS),
    },
    select: { id: true },
  });
}

async function userWithToken() {
  const user = await h.createUser();
  await h.prisma.user.update({ where: { id: user.id }, data: { fcmToken: 'tok-1' } });
  return user;
}

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
  initFcm({ projectId: 'snaply-test', serviceAccountJson: SERVICE_ACCOUNT });
});

describe('예고 대상 고르기', () => {
  it('D-3 을 지난 스냅에 예고를 보낸다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(1);
    expect(outcome.videos).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].notification.body).toContain('3일 후');
  });

  it('아직 D-3 이 안 된 스냅은 대상이 아니다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 5);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('이미 만료된 스냅에는 보내지 않는다 — 곧 지워진다고 할 시점이 지났다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS + 1);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
  });

  it('배치가 하루 쉬어도 밀린 예고가 나간다 — "정확히 그날" 이 아니라 "지났다" 로 찾는다', async () => {
    const user = await userWithToken();
    // D-3 을 하루 넘겼다(= D-2). 그날짜 매칭이면 영영 못 받는다.
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 2);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(1);
  });

  it('이미 지워진 스냅은 대상이 아니다', async () => {
    const user = await userWithToken();
    const snap = await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    await h.prisma.video.update({
      where: { id: snap.id },
      data: { deletedAt: new Date(), removalReason: 'user' },
    });

    expect((await sendExpiryNotices({ logger, now, apply: true })).notified).toBe(0);
  });
});

describe('중복 발송 방지', () => {
  it('같은 스냅의 같은 예고는 두 번 보내지 않는다 — 배치가 두 번 돌아도 안전하다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    await sendExpiryNotices({ logger, now, apply: true });
    const second = await sendExpiryNotices({ logger, now, apply: true });

    expect(second.notified).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('D-3 을 보냈어도 D-1 은 따로 나간다 — 예고는 두 번이다', async () => {
    const user = await userWithToken();
    const snap = await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    await sendExpiryNotices({ logger, now, apply: true });
    const later = new Date(now.getTime() + 2 * DAY_MS);
    const second = await sendExpiryNotices({ logger, now: later, apply: true });

    expect(second.notified).toBe(1);
    expect(send.mock.calls[1][0].notification.body).toContain('내일');
    const logs = await h.prisma.notificationLog.findMany({ where: { videoId: snap.id } });
    expect(logs.map((l) => l.noticeDaysBefore).sort()).toEqual([1, 3]);
  });

  it('스냅이 여러 개여도 사용자에게는 알림 한 번 — 5개면 알림 5개가 아니다', async () => {
    const user = await userWithToken();
    for (let i = 0; i < 5; i += 1) {
      await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    }

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.notified).toBe(1);
    expect(outcome.videos).toBe(5);
    expect(send.mock.calls[0][0].notification.body).toContain('5개');
  });
});

describe('보내지 못한 것을 보냈다고 하지 않는다', () => {
  it('FCM 이 dry-run 이면 기록을 남기지 않는다 — 다음 실행에서 다시 시도한다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    initFcm({ projectId: 'snaply-test', serviceAccountJson: '' }); // 서비스 계정 미주입

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(outcome.skipped.dry_run).toBe(1);
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('발송이 실패하면 선점을 되돌린다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    send.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'messaging/internal' }));

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(await h.prisma.notificationLog.count()).toBe(0);

    // 되돌렸으므로 다음 실행에서 다시 나간다.
    const retry = await sendExpiryNotices({ logger, now, apply: true });
    expect(retry.notified).toBe(1);
  });

  it('토큰이 없으면 건너뛰고 기록도 남기지 않는다', async () => {
    const user = await h.createUser();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped.no_token).toBe(1);
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('알림을 끈 사용자에게는 보내지 않는다 — 화면의 남은 기간 표시가 안전망이다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({ where: { id: user.id }, data: { notificationEnabled: false } });
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped.notifications_disabled).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('dry-run 실행(--yes 없이)', () => {
  it('대상만 세고 보내지도, 기록하지도 않는다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: false });

    expect(outcome.notified).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });
});
