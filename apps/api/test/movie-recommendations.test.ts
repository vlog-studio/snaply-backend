/**
 * 템플릿 스냅 추천 API.
 *
 * 이 기능의 비용은 후보 수에 비례하므로, 여기서 못 박는 것 대부분이 성능이 아니라 **과금**이다 —
 * 같은 요청이 재분석을 돌리지 않는다(멱등), 후보 수와 일일 횟수에 상한이 있다,
 * 약관 전에는 경로 자체가 꺼져 있다.
 *
 * 결정: docs/decisions/template-snap-recommendation.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';
import {
  DAILY_RECOMMENDATION_LIMIT,
  MAX_CANDIDATES,
  SCORING_DEADLINE_MS,
} from '../src/services/recommendation/recommendation-policy.js';

let h: Harness;

beforeAll(async () => {
  // 경로는 기본이 꺼짐이다. 켠 상태를 검증하려면 하네스에서 명시적으로 켠다.
  h = await createHarness({ MOVIE_RECOMMENDATION_ENABLED: 'true' });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

interface AnalysisFields {
  places?: string[];
  objects?: string[];
  actions?: string[];
  topics?: string[];
  usableForEdit?: boolean;
  visualQualityScore?: number;
  status?: 'queued' | 'processing' | 'done' | 'failed';
  errorCode?: string;
}

/** 업로드까지 끝난 스냅 1개. 분석 결과를 같이 주면 이미 분석이 끝난 상태로 만든다. */
async function createSnap(user: TestUser, analysis?: AnalysisFields): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status: 'ready',
      s3Key: `uploads/${user.id}/${Math.random().toString(36).slice(2)}.mp4`,
    },
  });
  if (analysis) {
    const status = analysis.status ?? 'done';
    await h.prisma.videoAnalysis.create({
      data: {
        videoId: video.id,
        userId: user.id,
        analysisVersion: ANALYSIS_VERSION,
        status,
        places: analysis.places ?? [],
        objects: analysis.objects ?? [],
        actions: analysis.actions ?? [],
        topics: analysis.topics ?? [],
        usableForEdit: analysis.usableForEdit ?? true,
        visualQualityScore: analysis.visualQualityScore ?? 0.8,
        confidence: 0.9,
        errorCode: analysis.errorCode ?? null,
        completedAt: status === 'done' ? new Date() : null,
      },
    });
  }
  return video.id;
}

function request(user: TestUser, body: { templateId: string; candidates: string[] }) {
  return h.app.inject({
    method: 'POST',
    url: '/movie-recommendations',
    headers: user.auth,
    payload: body,
  });
}

function fetchResult(user: TestUser, id: string) {
  return h.app.inject({
    method: 'GET',
    url: `/movie-recommendations/${id}`,
    headers: user.auth,
  });
}

describe('POST /movie-recommendations', () => {
  it('접수하고 202 로 응답한다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user), await createSnap(user)];

    const res = await request(user, { templateId: 'cafe', candidates });

    expect(res.statusCode).toBe(202);
    expect(res.json().data.status).toBe('processing');
    expect(await h.prisma.movieRecommendation.count()).toBe(1);
  });

  it('같은 후보 집합의 재요청은 새 추천을 만들지 않는다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user), await createSnap(user)];

    const first = await request(user, { templateId: 'cafe', candidates });
    const again = await request(user, { templateId: 'cafe', candidates });

    expect(again.json().data.id).toBe(first.json().data.id);
    // 화면을 다시 열 때마다 분석이 돌면 그게 그대로 비용이다.
    expect(await h.prisma.movieRecommendation.count()).toBe(1);
  });

  it('후보 순서만 다른 재요청도 같은 추천을 받는다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user), await createSnap(user)];

    const first = await request(user, { templateId: 'cafe', candidates });
    const reversed = await request(user, { templateId: 'cafe', candidates: [...candidates].reverse() });

    expect(reversed.json().data.id).toBe(first.json().data.id);
  });

  it('템플릿이 다르면 다른 추천이다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user), await createSnap(user)];

    const cafe = await request(user, { templateId: 'cafe', candidates });
    const walk = await request(user, { templateId: 'walk', candidates });

    expect(walk.json().data.id).not.toBe(cafe.json().data.id);
  });

  it('후보 수 상한을 넘기면 몇 개까지인지 알려준다', async () => {
    const user = await h.createUser();
    const candidates: string[] = [];
    for (let i = 0; i <= MAX_CANDIDATES; i += 1) candidates.push(await createSnap(user));

    const res = await request(user, { templateId: 'walk', candidates });

    expect(res.statusCode).toBe(400);
    // 앱이 상한을 하드코딩하지 않게 하는 값이다. 상한은 서버 정책이고 실측 후 바뀐다.
    expect(res.json().error).toMatchObject({ code: 'TOO_MANY_CANDIDATES', max: MAX_CANDIDATES });
  });

  it('남의 스냅이 섞여 있으면 403 이다', async () => {
    const user = await h.createUser();
    const other = await h.createUser();

    const res = await request(user, {
      templateId: 'walk',
      candidates: [await createSnap(user), await createSnap(other)],
    });

    expect(res.statusCode).toBe(403);
  });

  it('업로드가 확정되지 않은 스냅은 후보가 될 수 없다', async () => {
    const user = await h.createUser();
    const pending = await h.prisma.video.create({
      data: { userId: user.id, kind: 'source', status: 'pending', s3Key: 'uploads/x.mp4' },
    });

    const res = await request(user, { templateId: 'walk', candidates: [pending.id] });

    expect(res.statusCode).toBe(403);
  });

  it('없는 템플릿은 404 다', async () => {
    const user = await h.createUser();

    const res = await request(user, { templateId: 'nope', candidates: [await createSnap(user)] });

    expect(res.statusCode).toBe(404);
  });

  it('내린 템플릿으로는 추천을 만들 수 없다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user)];

    await h.prisma.movieTemplate.update({ where: { id: 'trip' }, data: { retiredAt: new Date() } });
    try {
      const res = await request(user, { templateId: 'trip', candidates });
      expect(res.statusCode).toBe(404);
    } finally {
      await h.prisma.movieTemplate.update({ where: { id: 'trip' }, data: { retiredAt: null } });
    }
  });

  it('일일 한도를 넘기면 429 다', async () => {
    const user = await h.createUser();
    await h.prisma.movieRecommendation.createMany({
      data: Array.from({ length: DAILY_RECOMMENDATION_LIMIT }, (_, i) => ({
        userId: user.id,
        templateId: 'walk',
        candidateHash: `filler-${i}`,
        status: 'done' as const,
      })),
    });

    const res = await request(user, { templateId: 'cafe', candidates: [await createSnap(user)] });

    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RECOMMENDATION_LIMIT');
  });

  it('한도에 걸려도 이미 만든 추천의 재조회는 막지 않는다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user)];
    const first = await request(user, { templateId: 'cafe', candidates });

    await h.prisma.movieRecommendation.createMany({
      data: Array.from({ length: DAILY_RECOMMENDATION_LIMIT }, (_, i) => ({
        userId: user.id,
        templateId: 'walk',
        candidateHash: `filler-${i}`,
        status: 'done' as const,
      })),
    });

    // 재사용은 비용이 0이므로 한도로 막을 이유가 없다.
    const again = await request(user, { templateId: 'cafe', candidates });
    expect(again.statusCode).toBe(202);
    expect(again.json().data.id).toBe(first.json().data.id);
  });

  it('플래그가 꺼져 있으면 503 이고 아무것도 만들지 않는다', async () => {
    const user = await h.createUser();
    const candidates = [await createSnap(user)];

    process.env.MOVIE_RECOMMENDATION_ENABLED = 'false';
    try {
      const res = await request(user, { templateId: 'cafe', candidates });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('RECOMMENDATION_DISABLED');
      expect(await h.prisma.movieRecommendation.count()).toBe(0);
    } finally {
      process.env.MOVIE_RECOMMENDATION_ENABLED = 'true';
    }
  });
});

describe('GET /movie-recommendations/:id', () => {
  it('분석이 끝나지 않았으면 processing 이고 슬롯이 비어 있다', async () => {
    const user = await h.createUser();
    // 분석 결과를 만들지 않았으므로 워커가 처리하기 전 상태다.
    const candidates = [await createSnap(user), await createSnap(user)];
    const { id } = (await request(user, { templateId: 'cafe', candidates })).json().data;

    const res = await fetchResult(user, id);

    expect(res.json().data.status).toBe('processing');
    expect(res.json().data.slots).toEqual([]);
  });

  it('분석이 다 끝났으면 슬롯을 템플릿 순서대로 채운다', async () => {
    const user = await h.createUser();
    const front = await createSnap(user, { objects: ['간판'], places: ['카페 외관'] });
    const menu = await createSnap(user, { objects: ['메뉴판'] });
    const drink = await createSnap(user, { objects: ['커피', '케이크'] });
    const { id } = (
      await request(user, { templateId: 'cafe', candidates: [front, menu, drink] })
    ).json().data;

    const data = (await fetchResult(user, id)).json().data;

    expect(data.status).toBe('done');
    expect(data.slots.map((s: { slotId: string }) => s.slotId)).toEqual([
      'front',
      'menu',
      'drink',
      'room',
      'sip',
    ]);
    const bySlot = new Map(
      data.slots.map((s: { slotId: string; videoId: string | null }) => [s.slotId, s.videoId]),
    );
    expect(bySlot.get('front')).toBe(front);
    expect(bySlot.get('menu')).toBe(menu);
    expect(bySlot.get('drink')).toBe(drink);
    // 후보가 슬롯보다 적으면 남는 자리는 비운다 — 화면에서 `지금 찍기` 가 된다.
    expect(bySlot.get('room')).toBeNull();
  });

  it('편집에 못 쓰는 스냅은 슬롯을 채우지 않고 이유가 남는다', async () => {
    const user = await h.createUser();
    const shaky = await createSnap(user, { usableForEdit: false, visualQualityScore: 0.1 });
    const good = await createSnap(user, { objects: ['커피'] });
    const { id } = (await request(user, { templateId: 'cafe', candidates: [shaky, good] })).json()
      .data;

    const data = (await fetchResult(user, id)).json().data;

    const used = data.slots.map((s: { videoId: string | null }) => s.videoId);
    expect(used).not.toContain(shaky);
    expect(used).toContain(good);
    expect(data.excluded).toContainEqual({ videoId: shaky, reason: 'unusable' });
  });

  it('분석이 실패한 후보가 있어도 나머지로 채운다', async () => {
    const user = await h.createUser();
    const broken = await createSnap(user, { status: 'failed', errorCode: 'SAFETY_REFUSED' });
    const good = await createSnap(user, { objects: ['간판'] });
    const { id } = (await request(user, { templateId: 'cafe', candidates: [broken, good] })).json()
      .data;

    const data = (await fetchResult(user, id)).json().data;

    expect(data.status).toBe('done');
    expect(data.slots.map((s: { videoId: string | null }) => s.videoId)).toContain(good);
    expect(data.excluded).toContainEqual({ videoId: broken, reason: 'analysis_failed' });
  });

  it('마감 시한을 넘기면 끝난 분석만으로 닫는다', async () => {
    const user = await h.createUser();
    const stuck = await createSnap(user, { status: 'processing' });
    const done = await createSnap(user, { objects: ['커피'] });
    const { id } = (await request(user, { templateId: 'cafe', candidates: [stuck, done] })).json()
      .data;

    // 분석 워커가 죽어도 추천이 영원히 걸려 있으면 안 된다.
    expect((await fetchResult(user, id)).json().data.status).toBe('processing');
    await h.prisma.movieRecommendation.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - SCORING_DEADLINE_MS - 1000) },
    });

    const data = (await fetchResult(user, id)).json().data;

    expect(data.status).toBe('done');
    expect(data.slots.map((s: { videoId: string | null }) => s.videoId)).toContain(done);
    expect(data.excluded).toContainEqual({ videoId: stuck, reason: 'analysis_failed' });
  });

  it('한 번 굳은 결과는 다시 채점하지 않는다', async () => {
    const user = await h.createUser();
    const snap = await createSnap(user, { objects: ['커피'] });
    const { id } = (await request(user, { templateId: 'cafe', candidates: [snap] })).json().data;

    const first = (await fetchResult(user, id)).json().data;
    const again = (await fetchResult(user, id)).json().data;

    expect(again).toEqual(first);
    expect(again.completedAt).toBe(first.completedAt);
  });

  it('남의 추천은 볼 수 없다', async () => {
    const user = await h.createUser();
    const other = await h.createUser();
    const { id } = (
      await request(user, { templateId: 'cafe', candidates: [await createSnap(user)] })
    ).json().data;

    expect((await fetchResult(other, id)).statusCode).toBe(404);
  });

  it('스냅이 삭제되면 그 자리만 비고 추천은 남는다', async () => {
    const user = await h.createUser();
    const snap = await createSnap(user, { objects: ['커피'] });
    const { id } = (await request(user, { templateId: 'cafe', candidates: [snap] })).json().data;
    expect((await fetchResult(user, id)).json().data.status).toBe('done');

    await h.prisma.video.delete({ where: { id: snap } });

    const data = (await fetchResult(user, id)).json().data;
    expect(data.status).toBe('done');
    expect(data.slots.every((s: { videoId: string | null }) => s.videoId === null)).toBe(true);
  });
});
