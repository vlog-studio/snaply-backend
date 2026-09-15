/**
 * 브이로그 완성 알림.
 *
 * 만료 예고와 성격이 다르다 — **놓쳐도 데이터를 잃지 않는다**(앱을 열면 무비가 거기 있다).
 * 그래서 조용한 시간대에는 보내지 않고 버리며, 그 차이를 여기서 고정한다.
 *
 * 발송 계층은 `fcm.test.ts` 와 같은 방식으로 대체한다 — 실기기 토큰 없이는 수신을 확인할 수 없다.
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
const { notifyMovieReady } = await import('../src/services/movie-ready-notice.service.js');
type Harness = Awaited<ReturnType<typeof createHarness>>;

let h: Harness;
const logger = { info: vi.fn(), warn: vi.fn() };

/** KST 오후 3시 — 조용한 시간대(22-8시) 밖. */
const daytime = new Date('2026-09-11T06:00:00.000Z');
/** KST 새벽 3시 — 조용한 시간대 안. */
const nighttime = new Date('2026-09-11T18:00:00.000Z');

async function userWithToken() {
  const user = await h.createUser();
  await h.prisma.user.update({ where: { id: user.id }, data: { fcmToken: 'tok-1' } });
  return user;
}

/** 완성된 무비와 그 결과물. */
async function readyMovie(userId: string, title = '제주 3일') {
  const video = await h.prisma.video.create({
    data: { userId, kind: 'result', status: 'completed', originalUrls: [] },
    select: { id: true },
  });
  const movie = await h.prisma.movie.create({
    data: { userId, title, status: 'ready', resultVideoId: video.id },
    select: { id: true },
  });
  return { movieId: movie.id, videoId: video.id };
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

describe('완성 알림', () => {
  it('무비 이름과 id 를 실어 보낸다 — 앱이 곧장 그 무비를 열 수 있어야 한다', async () => {
    const user = await userWithToken();
    const { movieId, videoId } = await readyMovie(user.id, '제주 3일');

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toEqual({ notified: true, movieId });
    const message = send.mock.calls[0]?.[0];
    expect(message?.notification?.body).toContain('제주 3일');
    expect(message?.data).toMatchObject({ kind: 'movie_ready', movieId, videoId });
  });

  it('무비 없이 만든 결과물에는 보내지 않는다 — 무엇이 완성됐는지 말할 수 없다', async () => {
    const user = await userWithToken();
    const video = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'completed', originalUrls: [] },
      select: { id: true },
    });

    const result = await notifyMovieReady({
      logger,
      userId: user.id,
      videoId: video.id,
      now: daytime,
    });

    expect(result).toEqual({ notified: false, reason: 'no_movie' });
    expect(send).not.toHaveBeenCalled();
  });

  it('남의 결과물로는 알림이 가지 않는다', async () => {
    const owner = await userWithToken();
    const other = await userWithToken();
    const { videoId } = await readyMovie(owner.id);

    const result = await notifyMovieReady({ logger, userId: other.id, videoId, now: daytime });

    expect(result).toEqual({ notified: false, reason: 'no_movie' });
  });
});

describe('보내지 않는 경우', () => {
  it('조용한 시간대에는 보내지 않고 버린다 — 놓쳐도 앱을 열면 무비가 있다', async () => {
    const user = await userWithToken();
    const { videoId } = await readyMovie(user.id);

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: nighttime });

    expect(result).toEqual({ notified: false, reason: 'quiet_hours' });
    expect(send).not.toHaveBeenCalled();
  });

  it('알림을 끈 사용자에게는 보내지 않는다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({ where: { id: user.id }, data: { notificationEnabled: false } });
    const { videoId } = await readyMovie(user.id);

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toEqual({ notified: false, reason: 'notifications_disabled' });
  });

  it('토큰이 없으면 no_token 으로 끝난다 — 예외를 던지지 않는다', async () => {
    const user = await h.createUser();
    const { videoId } = await readyMovie(user.id);

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toEqual({ notified: false, reason: 'no_token' });
  });

  it('지운 무비에는 보내지 않는다', async () => {
    const user = await userWithToken();
    const { movieId, videoId } = await readyMovie(user.id);
    await h.prisma.movie.update({ where: { id: movieId }, data: { deletedAt: new Date() } });

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toEqual({ notified: false, reason: 'no_movie' });
  });
});

describe('종류별 스위치', () => {
  it('무비 알림만 꺼도 보내지 않는다 — 전체를 끌 필요가 없다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({
      where: { id: user.id },
      data: { movieNotificationEnabled: false },
    });
    const { videoId } = await readyMovie(user.id);

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toEqual({ notified: false, reason: 'notifications_disabled' });
    expect(send).not.toHaveBeenCalled();
  });

  it('위치 알림만 꺼둔 것은 무비 알림에 영향을 주지 않는다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({
      where: { id: user.id },
      data: { locationNotificationEnabled: false },
    });
    const { videoId } = await readyMovie(user.id);

    const result = await notifyMovieReady({ logger, userId: user.id, videoId, now: daytime });

    expect(result).toMatchObject({ notified: true });
  });
});
