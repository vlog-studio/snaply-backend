/**
 * 스냅 분석 동의(옵트인) — 기록·버전·철회와, 동의가 분석과 추천을 실제로 막는지.
 *
 * 법무 검토 전에도 분석을 켤 수 있게 한 근거가 이 동의다. 그래서 "앱이 묻는다"가 아니라
 * "서버가 동의 없이는 보내지 않는다"를 여기서 못 박는다.
 * 결정: docs/decisions/snap-content-analysis.md §6.1 · specs ANA-5·REC-4
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SNAP_ANALYSIS_CONSENT_VERSION } from '@vlog-studio/shared-types';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness({ MOVIE_RECOMMENDATION_ENABLED: 'true' });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

function read(user: TestUser) {
  return h.app.inject({ method: 'GET', url: '/auth/me/analysis-consent', headers: user.auth });
}

function grant(user: TestUser, version = SNAP_ANALYSIS_CONSENT_VERSION) {
  return h.app.inject({
    method: 'POST',
    url: '/auth/me/analysis-consent',
    headers: user.auth,
    payload: { version },
  });
}

function revoke(user: TestUser) {
  return h.app.inject({ method: 'DELETE', url: '/auth/me/analysis-consent', headers: user.auth });
}

function requestAnalysis(user: TestUser, videoId: string) {
  return h.app.inject({ method: 'POST', url: `/videos/${videoId}/analysis`, headers: user.auth });
}

async function createSnap(user: TestUser): Promise<string> {
  const video = await h.prisma.video.create({
    data: { userId: user.id, kind: 'source', status: 'ready', s3Key: `uploads/${user.id}/snap.mp4` },
  });
  return video.id;
}

/** 분석 결과 1건과 그 분석으로 만든 추천 1건. 철회가 파기해야 하는 것들이다. */
async function seedAnalysisAndRecommendation(user: TestUser): Promise<string> {
  const videoId = await createSnap(user);
  await h.prisma.videoAnalysis.create({
    data: {
      videoId,
      userId: user.id,
      analysisVersion: ANALYSIS_VERSION,
      status: 'done',
      summary: '카페에서 음료를 든 손',
      usableForEdit: true,
    },
  });
  const recommendation = await h.prisma.movieRecommendation.create({
    data: {
      userId: user.id,
      templateId: 'cafe',
      candidateVideoIds: [videoId],
      candidateHash: `hash-${videoId}`,
      status: 'done',
      excluded: [{ videoId, reason: 'unusable' }],
    },
  });
  await h.prisma.movieRecommendationItem.create({
    data: { recommendationId: recommendation.id, slotId: 'drink', position: 2, videoId, score: 0.8 },
  });
  return videoId;
}

describe('GET /auth/me/analysis-consent', () => {
  it('기본은 동의 없음이다 — 분석은 옵트인이다', async () => {
    const user = await h.createUser();

    const res = await read(user);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      available: true,
      currentVersion: SNAP_ANALYSIS_CONSENT_VERSION,
      granted: false,
      grantedAt: null,
    });
  });

  it('서버 스위치가 꺼져 있으면 available 이 false 다 — 앱은 묻지 않는다', async () => {
    const user = await h.createUser();

    process.env.MOVIE_RECOMMENDATION_ENABLED = 'false';
    try {
      const res = await read(user);
      expect(res.json().data.available).toBe(false);
    } finally {
      process.env.MOVIE_RECOMMENDATION_ENABLED = 'true';
    }
  });

  it('로그인하지 않으면 401 이다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/auth/me/analysis-consent' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/me/analysis-consent', () => {
  it('현재 버전에 동의하면 granted 가 되고, 버전과 시각이 기록된다', async () => {
    const user = await h.createUser();

    const res = await grant(user);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.granted).toBe(true);
    expect(res.json().data.grantedAt).not.toBeNull();

    const rows = await h.prisma.userConsent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('snap_analysis');
    expect(rows[0]?.version).toBe(SNAP_ANALYSIS_CONSENT_VERSION);
    expect(rows[0]?.revokedAt).toBeNull();
    expect((await read(user)).json().data.granted).toBe(true);
  });

  it('다시 동의해도 기록이 늘지 않는다 (멱등)', async () => {
    const user = await h.createUser();

    const first = await grant(user);
    const second = await grant(user);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.grantedAt).toBe(first.json().data.grantedAt);
    expect(await h.prisma.userConsent.count({ where: { userId: user.id } })).toBe(1);
  });

  it('보여 준 문구가 현재 버전이 아니면 409 이고 기록하지 않는다', async () => {
    const user = await h.createUser();

    const res = await grant(user, '2000-01-01');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONSENT_VERSION_MISMATCH');
    expect(await h.prisma.userConsent.count({ where: { userId: user.id } })).toBe(0);
  });

  it('이전 버전의 문구에 한 동의는 현재 동의로 치지 않는다 — 문구가 바뀌면 다시 묻는다', async () => {
    const user = await h.createUser();
    await h.prisma.userConsent.create({
      data: { userId: user.id, kind: 'snap_analysis', version: '2000-01-01' },
    });

    expect((await read(user)).json().data.granted).toBe(false);
    const res = await requestAnalysis(user, await createSnap(user));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ANALYSIS_CONSENT_REQUIRED');
  });
});

describe('DELETE /auth/me/analysis-consent', () => {
  it('철회하면 granted 가 false 가 되고, 동의 기록은 철회 시각과 함께 남는다', async () => {
    const user = await h.createUser();
    await grant(user);

    const res = await revoke(user);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.granted).toBe(false);

    const rows = await h.prisma.userConsent.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect((await read(user)).json().data.granted).toBe(false);
  });

  it('철회하면 그 사용자의 분석 결과와 추천 기록을 파기하고, 남의 것은 건드리지 않는다', async () => {
    const user = await h.createUser();
    const other = await h.createUser();
    await grant(user);
    await grant(other);
    const videoId = await seedAnalysisAndRecommendation(user);
    await seedAnalysisAndRecommendation(other);

    await revoke(user);

    expect(await h.prisma.videoAnalysis.count({ where: { userId: user.id } })).toBe(0);
    expect(await h.prisma.movieRecommendation.count({ where: { userId: user.id } })).toBe(0);
    expect(await h.prisma.movieRecommendationItem.count({ where: { videoId } })).toBe(0);
    // 스냅 자체는 그대로다 — 파기하는 것은 분석에서 나온 것뿐이다.
    expect(await h.prisma.video.count({ where: { id: videoId } })).toBe(1);

    expect(await h.prisma.videoAnalysis.count({ where: { userId: other.id } })).toBe(1);
    expect(await h.prisma.movieRecommendation.count({ where: { userId: other.id } })).toBe(1);
  });

  it('철회한 뒤에는 분석 요청이 403 이다', async () => {
    const user = await h.createUser();
    await grant(user);
    await revoke(user);

    const res = await requestAnalysis(user, await createSnap(user));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ANALYSIS_CONSENT_REQUIRED');
  });

  it('동의가 없어도 철회는 성공한다 (멱등)', async () => {
    const user = await h.createUser();

    const res = await revoke(user);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.granted).toBe(false);
  });

  it('철회한 뒤 다시 동의할 수 있다 — 새 기록이 남는다', async () => {
    const user = await h.createUser();
    await grant(user);
    await revoke(user);

    const res = await grant(user);
    expect(res.json().data.granted).toBe(true);
    expect(await h.prisma.userConsent.count({ where: { userId: user.id } })).toBe(2);
  });
});

describe('동의와 서버 스위치가 분석·추천을 막는다', () => {
  it('동의 없이 분석을 요청하면 403 이고 분석 행을 만들지 않는다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);

    const res = await requestAnalysis(user, videoId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ANALYSIS_CONSENT_REQUIRED');
    expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(0);
  });

  it('서버 스위치가 꺼져 있으면 동의해도 분석 요청이 503 이다', async () => {
    const user = await h.createUser();
    await grant(user);
    const videoId = await createSnap(user);

    process.env.MOVIE_RECOMMENDATION_ENABLED = 'false';
    try {
      const res = await requestAnalysis(user, videoId);
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('ANALYSIS_DISABLED');
      expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(0);
    } finally {
      process.env.MOVIE_RECOMMENDATION_ENABLED = 'true';
    }
  });

  it('동의 없이 추천을 요청하면 403 이고 추천을 만들지 않는다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user), await createSnap(user)];

    const res = await h.app.inject({
      method: 'POST',
      url: '/movie-recommendations',
      headers: user.auth,
      payload: { templateId: 'cafe', candidates },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ANALYSIS_CONSENT_REQUIRED');
    expect(await h.prisma.movieRecommendation.count()).toBe(0);
    expect(await h.prisma.videoAnalysis.count()).toBe(0);
  });
});
