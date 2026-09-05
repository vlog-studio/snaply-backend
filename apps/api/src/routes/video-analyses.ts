import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getVideoAnalysis, requestVideoAnalysis, ok } from '@vlog-studio/shared-types';
import { getLatestAnalysis, requestAnalysis } from '../services/video-analysis.service.js';

export async function videoAnalysisRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /videos/:videoId/analysis — 분석 요청 (멱등)
  routes.post(
    requestVideoAnalysis.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...requestVideoAnalysis.schema,
        tags: ['videos'],
        summary: '스냅 내용 분석 요청 (비동기)',
        description: [
          '업로드된 source 스냅의 대표 프레임을 AI 워커가 분석해 주제·사물·행동·분위기와',
          '편집 사용 가능 여부를 기록한다. **비동기** — 즉시 `202`와 `analysisId`만 돌려주고,',
          '실제 분석은 Python 분석 워커가 큐에서 꺼내 처리한다. 진행 상태는',
          '`GET /videos/{videoId}/analysis` 로 폴링한다.',
          '',
          '**업로드 시 자동으로 분석하지 않는다.** 스냅은 대량으로 올라오고 실제 편집에 쓰이는',
          '것은 일부라, 업로드마다 분석하면 버려질 스냅까지 과금된다. 그래서 편집에 쓸 후보가',
          '정해진 시점에 이 API 를 호출한다.',
          '',
          '**멱등하다.** 같은 영상에 여러 번 호출해도 분석은 버전당 한 번만 돈다.',
          '- 진행 중(`queued`/`processing`)이면 같은 `analysisId` 를 그대로 돌려준다',
          '- 실패한 분석은 같은 호출로 재시도된다 (별도 retry API 가 없다)',
          '- 이미 `done` 이면 다시 돌리지 않는다',
          '- 다시 해도 같은 결과인 실패(손상된 영상, 정책 거절)는 **409**',
          '',
          '분석 결과는 자동 편집 추천의 입력이며 사용자에게 보여주기 위한 문구가 아니다.',
          '',
          '```json',
          '{ "success": true, "data": { "analysisId": "uuid", "version": 1, "status": "queued" } }',
          '```',
        ].join('\n'),
      },
    },
    async (request, reply) => {
      const { analysis } = await requestAnalysis({
        userId: request.user.id,
        videoId: request.params.videoId,
      });
      reply.status(202);
      return ok({
        analysisId: analysis.id,
        version: analysis.version,
        // 요청 직후의 분석은 실패 상태일 수 없다 — 실패한 것은 이 호출이 재시도로 되살린다.
        status: analysis.status === 'failed' ? 'queued' : analysis.status,
      });
    },
  );

  // GET /videos/:videoId/analysis — 최신 버전 분석 조회
  routes.get(
    getVideoAnalysis.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getVideoAnalysis.schema,
        tags: ['videos'],
        summary: '스냅 분석 상태·결과 조회',
        description: [
          '가장 최신 버전의 분석 1건을 반환한다. 분석을 요청한 적이 없으면 **404**.',
          '',
          '`status` 의 의미:',
          '- `queued` — 큐에 적재됨, 워커 대기 중',
          '- `processing` — 워커가 프레임을 추출해 모델을 호출하는 중',
          '- `done` — `result` 가 채워진다',
          '- `failed` — `error.code` 와 `error.retryable` 이 채워진다.',
          '  `retryable: true` 면 같은 영상으로 `POST /videos/{videoId}/analysis` 를 다시 호출하면 재시도된다',
          '',
          '**분석 실패는 원본 영상에 영향을 주지 않는다** — `Video.status` 는 `ready` 로 남는다.',
          '실패해도 이 조회 자체는 성공이므로 HTTP 200 이다. 모델의 원문 오류 메시지는 노출하지 않는다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await getLatestAnalysis({
        userId: request.user.id,
        videoId: request.params.videoId,
      });
      return ok(data);
    },
  );
}
