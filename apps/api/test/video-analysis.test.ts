/**
 * 스냅 내용 분석 API — 요청 멱등성, 재시도 경계, 조회 계약.
 *
 * 이 기능의 비용은 모델 호출에 비례하므로 "같은 스냅이 두 번 분석되지 않는다"가
 * 성능 문제가 아니라 과금 문제다. 그래서 멱등성을 여기서 못 박는다.
 * 결정: docs/decisions/snap-content-analysis.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { ANALYSIS_VERSION } from '../src/services/video-analysis.service.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function createSnap(
  user: TestUser,
  status: 'pending' | 'ready' = 'ready',
): Promise<string> {
  const video = await h.prisma.video.create({
    data: {
      userId: user.id,
      kind: 'source',
      status,
      s3Key: `uploads/${user.id}/snap.mp4`,
    },
  });
  return video.id;
}

function requestAnalysis(user: TestUser, videoId: string) {
  return h.app.inject({
    method: 'POST',
    url: `/videos/${videoId}/analysis`,
    headers: user.auth,
  });
}

function getAnalysis(user: TestUser, videoId: string) {
  return h.app.inject({
    method: 'GET',
    url: `/videos/${videoId}/analysis`,
    headers: user.auth,
  });
}

describe('POST /videos/:videoId/analysis', () => {
  it('분석 레코드를 정확히 1개 만들고 202로 응답한다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);

    const res = await requestAnalysis(user, videoId);
    expect(res.statusCode).toBe(202);
    expect(res.json().data.status).toBe('queued');
    expect(res.json().data.version).toBe(ANALYSIS_VERSION);

    const rows = await h.prisma.videoAnalysis.findMany({ where: { videoId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('queued');
    expect(rows[0]?.userId).toBe(user.id);
    // 분석 전에는 모델·프롬프트를 모른다 — 완료 시점에 워커가 채운다.
    expect(rows[0]?.modelVersion).toBeNull();
    expect(rows[0]?.attempts).toBe(0);
  });

  it('같은 영상을 여러 번 요청해도 분석은 1건이다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);

    const first = await requestAnalysis(user, videoId);
    const second = await requestAnalysis(user, videoId);
    expect(second.statusCode).toBe(202);
    expect(second.json().data.analysisId).toBe(first.json().data.analysisId);

    expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(1);
  });

  it('실패한 분석은 같은 레코드를 queued로 되돌려 재시도한다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const created = await requestAnalysis(user, videoId);
    const analysisId = created.json().data.analysisId;

    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        errorCode: 'RATE_LIMITED',
        errorMessage: '429',
        attempts: 1,
        completedAt: new Date(),
      },
    });

    const retry = await requestAnalysis(user, videoId);
    expect(retry.statusCode).toBe(202);
    expect(retry.json().data.analysisId).toBe(analysisId);

    const row = await h.prisma.videoAnalysis.findUnique({ where: { id: analysisId } });
    expect(row?.status).toBe('queued');
    expect(row?.errorCode).toBeNull();
    // attempts 는 워커가 실제로 실행할 때 올린다 — 요청만으로는 늘지 않는다.
    expect(row?.attempts).toBe(1);
  });

  it('다시 해도 같은 결과인 실패는 409로 막는다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;

    // 손상된 영상 — 프레임을 하나도 못 뽑았다.
    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorCode: 'FRAME_EXTRACTION_FAILED' },
    });

    const res = await requestAnalysis(user, videoId);
    expect(res.statusCode).toBe(409);
    const row = await h.prisma.videoAnalysis.findUnique({ where: { id: analysisId } });
    expect(row?.status).toBe('failed');
  });

  it('이미 완료된 분석은 다시 돌리지 않는다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;
    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: { status: 'done', summary: '카페 영상', completedAt: new Date() },
    });

    const res = await requestAnalysis(user, videoId);
    expect(res.statusCode).toBe(202);
    expect(res.json().data.status).toBe('done');

    const row = await h.prisma.videoAnalysis.findUnique({ where: { id: analysisId } });
    expect(row?.status).toBe('done');
  });

  it('업로드가 확정되지 않은 영상은 400이다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user, 'pending');

    const res = await requestAnalysis(user, videoId);
    expect(res.statusCode).toBe(400);
    expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(0);
  });

  it('남의 영상은 403이 아니라 404다', async () => {
    const owner = await h.createUser();
    const other = await h.createUser();
    const videoId = await createSnap(owner);

    const res = await requestAnalysis(other, videoId);
    expect(res.statusCode).toBe(404);
    expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(0);
  });

  it('편집 결과물(kind=result)은 분석 대상이 아니다', async () => {
    const user = await h.createUser();
    const result = await h.prisma.video.create({
      data: { userId: user.id, kind: 'result', status: 'done' },
    });

    const res = await requestAnalysis(user, result.id);
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /videos/:videoId/analysis', () => {
  it('완료된 분석의 결과를 계약대로 내려준다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;

    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'done',
        durationMs: 3012,
        frameTimestampsMs: [301, 1105, 1907, 2711],
        summary: '카페에서 디저트와 커피를 촬영한 영상',
        topics: ['카페', '디저트'],
        places: ['카페'],
        objects: ['케이크', '커피'],
        actions: ['디저트를 가까이 보여줌'],
        moods: ['차분한'],
        visualQualityScore: 0.86,
        visualIssues: ['shaky'],
        usableForEdit: true,
        confidence: 0.91,
        modelVersion: 'gpt-5.6-luna',
        promptVersion: 'v1',
        inputTokens: 800,
        outputTokens: 110,
        attempts: 1,
        completedAt: new Date(),
      },
    });

    const res = await getAnalysis(user, videoId);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.status).toBe('done');
    expect(data.error).toBeNull();
    expect(data.result.durationMs).toBe(3012);
    expect(data.result.summary).toBe('카페에서 디저트와 커피를 촬영한 영상');
    expect(data.result.visualQuality).toEqual({
      score: 0.86,
      issues: ['shaky'],
      usableForEdit: true,
    });
    expect(data.modelVersion).toBe('gpt-5.6-luna');
    expect(data.attempts).toBe(1);
  });

  it('진행 중이면 result가 null이다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    await requestAnalysis(user, videoId);

    const res = await getAnalysis(user, videoId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('queued');
    expect(res.json().data.result).toBeNull();
  });

  it('실패는 200 + 분류 코드로 내려주고 원문 메시지는 감춘다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;
    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        errorCode: 'RATE_LIMITED',
        errorMessage: 'openai 원문 오류 메시지',
        completedAt: new Date(),
      },
    });

    const res = await getAnalysis(user, videoId);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.error).toEqual({ code: 'RATE_LIMITED', retryable: true });
    expect(res.payload).not.toContain('원문 오류 메시지');
  });

  it('되돌릴 수 없는 실패는 retryable=false 로 알린다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;
    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorCode: 'SAFETY_REFUSED', completedAt: new Date() },
    });

    const res = await getAnalysis(user, videoId);
    expect(res.json().data.error.retryable).toBe(false);
  });

  it('분석 기록이 없으면 404다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);

    const res = await getAnalysis(user, videoId);
    expect(res.statusCode).toBe(404);
  });

  it('남의 분석은 404다', async () => {
    const owner = await h.createUser();
    const other = await h.createUser();
    const videoId = await createSnap(owner);
    await requestAnalysis(owner, videoId);

    const res = await getAnalysis(other, videoId);
    expect(res.statusCode).toBe(404);
  });
});

describe('분석과 영상 생명주기', () => {
  it('분석 실패가 원본 영상 상태를 바꾸지 않는다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    const analysisId = (await requestAnalysis(user, videoId)).json().data.analysisId;
    await h.prisma.videoAnalysis.update({
      where: { id: analysisId },
      data: { status: 'failed', errorCode: 'INTERNAL' },
    });

    const video = await h.prisma.video.findUnique({ where: { id: videoId } });
    expect(video?.status).toBe('ready');
  });

  it('영상을 삭제하면 분석 조회도 404가 된다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    await requestAnalysis(user, videoId);

    const deleted = await h.app.inject({
      method: 'DELETE',
      url: `/videos/${videoId}`,
      headers: user.auth,
    });
    expect(deleted.statusCode).toBe(200);

    expect((await getAnalysis(user, videoId)).statusCode).toBe(404);
    expect((await requestAnalysis(user, videoId)).statusCode).toBe(404);
  });

  it('영상 레코드가 실제로 지워지면 분석도 함께 사라진다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    await requestAnalysis(user, videoId);

    // 계정 purge·고아 회수 배치는 소프트 삭제가 아니라 실삭제를 한다.
    await h.prisma.video.delete({ where: { id: videoId } });
    expect(await h.prisma.videoAnalysis.count({ where: { videoId } })).toBe(0);
  });

  it('기존 Video 응답 계약에는 분석 필드가 추가되지 않는다', async () => {
    const user = await h.createUser();
    const videoId = await createSnap(user);
    await requestAnalysis(user, videoId);

    const res = await h.app.inject({
      method: 'GET',
      url: `/videos/${videoId}`,
      headers: user.auth,
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data).sort()).toEqual([
      'createdAt',
      'durationSeconds',
      'editedUrl',
      'id',
      'kind',
      'originalUrls',
      'status',
      'stylePreset',
      'thumbnailUrl',
    ]);
  });
});
