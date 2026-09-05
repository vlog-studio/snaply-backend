import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  cancelEditJob,
  createEditJob,
  getEditJob,
  ok,
  type ClipSpec,
} from '@vlog-studio/shared-types';
import { createRedisConnection, editProgressChannel } from '../lib/redis.js';
import {
  cancelEditJob as cancelEditJobForOwner,
  createEditJob as enqueueEditJob,
  getEditJob as getEditJobForUser,
  getEditJobForOwner,
  getEditJobOutputUrl,
} from '../services/edit-job.service.js';

export async function editJobRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /edit-jobs — 편집 요청 (BullMQ 큐 적재)
  routes.post(
    createEditJob.fastifyPath,
    {
      preHandler: app.authenticate,
      config: {
        // 유저(토큰)당 분당 5회
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        ...createEditJob.schema,
        tags: ['edit-jobs'],
        summary: '편집 요청 (큐 적재)',
        description: [
          '여러 클립을 하나의 숏폼으로 합치는 AI 편집을 요청한다. **비동기** — 즉시 `202`와 `jobId`만 돌려주고, 실제 편집은 Python 워커가 큐에서 꺼내 처리한다.',
          '',
          '`npm run worker`가 떠 있지 않으면 job이 `queued`에 머문 채 진행되지 않는다.',
          '',
          '요청은 `clips`(시간 구간 지정, 권장) 또는 `videoIds`(전체 영상, 구버전 호환) 중 하나로 보낸다. `clips`는 최종 합성 순서이며, 같은 영상을 다른 구간으로 반복 사용할 수 있다.',
          '',
          '서버가 순서대로 하는 일:',
          '1. 참조된 영상 전부가 **내 소유 + `source` + `ready` 상태**인지 검증 (하나라도 아니면 403)',
          '2. 결과물이 담길 새 영상 레코드를 `kind: result`, `processing`으로 생성',
          '3. `edit_jobs` 레코드를 `queued`로 생성하고 (editSpec/renderSpec 스냅샷 포함) BullMQ 큐에 적재',
          '4. 크레딧을 예약(차감)한다 — 2·3·4는 한 트랜잭션이라 잔액이 모자라면 작업 자체가 만들어지지 않는다',
          '',
          '**크레딧**: export 1회에 100크레딧을 예약한다. 잔액이 모자라면 `402 INSUFFICIENT_CREDITS` 이며 응답의 `required`·`balance`로 부족분을 표시할 수 있다. 작업이 실패하거나 취소되면 예약분은 자동 환급된다.',
          '',
          '**진행 상황 확인** — 둘 중 하나:',
          '- `GET /edit-jobs/{id}` 폴링 (Swagger에서 가능)',
          '- WebSocket `ws://localhost:3000/edit-jobs/{id}/progress?token={jwt}` (실시간, Swagger 미지원)',
          '',
          '워커가 끝내면 3번에서 만든 결과물 영상의 `status`가 `done`, `editedUrl`이 채워진다. `GET /videos/{id}`로 확인.',
          '',
          '응답: `{ "success": true, "data": { "jobId": "uuid" } }`',
          '',
          '⚠️ **Rate limit: 토큰당 분당 5회.** 6번째 호출은 `429 RATE_LIMITED`.',
        ].join('\n'),
      },
    },
    async (request, reply) => {
      const clips: ClipSpec[] = request.body.clips
        ? request.body.clips.map((clip) => ({
            videoId: clip.videoId,
            startMs: clip.startMs,
            ...(clip.endMs !== undefined ? { endMs: clip.endMs } : {}),
          }))
        : (request.body.videoIds ?? []).map((videoId) => ({ videoId, startMs: 0 }));
      const data = await enqueueEditJob({
        userId: request.user.id,
        clips,
        stylePreset: request.body.stylePreset,
        outputProfile: request.body.outputProfile,
        fitMode: request.body.fitMode,
        subtitles: request.body.subtitles,
      });
      reply.status(202);
      return ok(data);
    },
  );

  // GET /edit-jobs/:id — 편집 작업 상태 조회
  routes.get(
    getEditJob.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getEditJob.schema,
        tags: ['edit-jobs'],
        summary: '편집 작업 상태 조회',
        description: [
          '`POST /edit-jobs`로 만든 작업의 진행 상태. WebSocket 대신 **폴링으로 확인할 때 쓰는 엔드포인트**라 Swagger에서 편집 전 과정을 추적할 수 있다.',
          '',
          '- `status`: `queued`(워커 대기) → `processing` → `done` | `failed` | `canceled`(사용자 취소)',
          '- `progress`: 0~100. 워커가 단계별로 갱신한다',
          '- `videoId`: **결과물** 영상 id (원본 클립이 아니다). 완료 후 `GET /videos/{videoId}`로 `editedUrl`을 얻는다',
          '- `errorMessage`: `failed`일 때만 채워진다 (서버 진단용 원문 — 사용자 노출 문구가 아니다)',
          '- `errorCode`: `failed`일 때의 분류 코드. `TIMEOUT` | `SOURCE_UNAVAILABLE` | `QUEUE_FAILED` | `INTERNAL`. 앱은 이 코드로 사용자 문구를 분기한다',
          '- `pipelineVersion`/`editSpec`/`renderSpec`: 재현 가능한 작업 스냅샷',
          '',
          '남의 작업은 404.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await getEditJobForUser({ userId: request.user.id, jobId: request.params.id });
      return ok(data);
    },
  );

  // DELETE /edit-jobs/:id — 진행 중 편집 작업 취소
  routes.delete(
    cancelEditJob.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...cancelEditJob.schema,
        tags: ['edit-jobs'],
        summary: '편집 작업 취소',
        description: [
          '`queued` 또는 `processing` 상태의 편집 작업을 취소한다. 최종 상태는 `canceled`.',
          '',
          '- 대기 중(queued) 작업은 큐에서 제거되어 처리되지 않는다.',
          '- 처리 중(processing) 작업은 워커가 다음 진행률 갱신 시점에 취소를 감지하고 중단한다. 이미 업로드 직전 단계라면 완료될 수 있으나, `canceled`로 확정된 작업이 `done`으로 되살아나지는 않는다.',
          '- 결과물 영상 레코드는 삭제 처리되어 목록에 나타나지 않는다.',
          '- 열려 있는 진행률 WebSocket에는 `{"status":"canceled"}` 메시지 후 연결이 종료된다.',
          '- 이미 취소된 작업의 재취소는 200(멱등). `done`/`failed`로 끝난 작업은 409.',
          '- 예약된 크레딧은 전액 환급된다. 재취소해도 환급은 한 번만 기록된다.',
        ].join('\n'),
      },
    },
    async (request) => {
      await cancelEditJobForOwner({ userId: request.user.id, jobId: request.params.id });
      return ok({ canceled: true });
    },
  );

  // WebSocket GET /edit-jobs/:id/progress — 실시간 진행률 스트리밍
  // 메시지 계약은 shared-types 의 `editProgressEventSchema` 가 원천이다.
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id/progress',
    // WebSocket은 OpenAPI로 표현되지 않으므로 문서에서 숨김 (api-spec.md 참고)
    { websocket: true, preHandler: app.authenticate, schema: { hide: true } },
    async (ws, request) => {
      const jobId = request.params.id;

      const job = await getEditJobForOwner({ userId: request.user.id, jobId });
      if (!job) {
        ws.send(JSON.stringify({ status: 'failed', error: '편집 작업을 찾을 수 없습니다.' }));
        ws.close();
        return;
      }

      // 이미 종료된 작업이면 최종 상태만 보내고 종료
      if (job.status === 'done') {
        // 실시간 완료 메시지와 같은 계약 — outputUrl 포함 (api-spec.md)
        const outputUrl = await getEditJobOutputUrl(job.videoId);
        ws.send(
          JSON.stringify({ progress: 100, step: '완료', ...(outputUrl ? { outputUrl } : {}) }),
        );
        ws.close();
        return;
      }
      if (job.status === 'failed') {
        ws.send(
          JSON.stringify({
            status: 'failed',
            error: job.errorMessage ?? '편집 실패',
            ...(job.errorCode ? { code: job.errorCode } : {}),
          }),
        );
        ws.close();
        return;
      }
      if (job.status === 'canceled') {
        ws.send(JSON.stringify({ status: 'canceled' }));
        ws.close();
        return;
      }

      // 현재 진행률 스냅샷 전송
      ws.send(JSON.stringify({ progress: job.progress, step: '연결됨' }));

      // Redis Pub/Sub 구독 (전용 연결)
      const sub = createRedisConnection();
      const channel = editProgressChannel(jobId);

      const cleanup = async (): Promise<void> => {
        try {
          await sub.unsubscribe(channel);
        } catch {
          /* noop */
        }
        await sub.quit().catch(() => undefined);
      };

      sub.on('message', (_ch, message) => {
        if (ws.readyState !== ws.OPEN) {
          return;
        }
        ws.send(message);
        try {
          const parsed = JSON.parse(message) as { progress?: number; status?: string };
          if (parsed.progress === 100 || parsed.status === 'failed' || parsed.status === 'canceled') {
            ws.close();
          }
        } catch {
          /* 원본 메시지는 이미 전달됨 */
        }
      });

      await sub.subscribe(channel);

      ws.on('close', () => {
        void cleanup();
      });
      ws.on('error', () => {
        void cleanup();
      });
    },
  );
}
