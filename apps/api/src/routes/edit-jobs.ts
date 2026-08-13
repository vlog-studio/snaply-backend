import type { FastifyInstance } from 'fastify';
import {
  DEFAULT_FIT_MODE,
  DEFAULT_OUTPUT_PROFILE,
  type ApiSuccess,
  type ClipSpec,
  type EditJob,
  type FitMode,
  type OutputProfile,
  type StylePreset,
} from '@vlog-studio/shared-types';
import { createRedisConnection, editProgressChannel } from '../lib/redis.js';
import {
  API_ERROR_SCHEMA,
  AUTHENTICATED_ERROR_RESPONSES,
  EDIT_JOB_SCHEMA,
  JOB_CREATED_SCHEMA,
  successResponseSchema,
} from '../schemas/responses.js';
import {
  cancelEditJob,
  createEditJob,
  getEditJob,
  getEditJobForOwner,
  getEditJobOutputUrl,
} from '../services/edit-job.service.js';

interface CreateEditJobBody {
  clips?: Array<Omit<ClipSpec, 'startMs'> & { startMs?: number }>;
  /** @deprecated clips를 사용하세요. */
  videoIds?: string[];
  stylePreset: StylePreset;
  subtitles?: boolean;
  outputProfile?: OutputProfile;
  fitMode?: FitMode;
}

export async function editJobRoutes(app: FastifyInstance): Promise<void> {
  // POST /edit-jobs — 편집 요청 (BullMQ 큐 적재)
  app.post<{ Body: CreateEditJobBody }>(
    '/edit-jobs',
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
          '',
          '_플랜별 편집 횟수/해상도/워터마크 제한은 기획 확정 시까지 미적용 (docs/plan-limits.md)._',
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
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['stylePreset'],
          oneOf: [{ required: ['clips'] }, { required: ['videoIds'] }],
          properties: {
            clips: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['videoId'],
                properties: {
                  videoId: { type: 'string', format: 'uuid' },
                  startMs: { type: 'integer', minimum: 0, maximum: 86_400_000, default: 0 },
                  endMs: { type: 'integer', minimum: 1, maximum: 86_400_000 },
                },
              },
              minItems: 1,
              maxItems: 10,
            },
            videoIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              maxItems: 10,
              description:
                '이어붙일 원본 클립 id 목록. **배열 순서대로** 연결된다. 1~10개. 모두 `status: "ready"`이고 내 소유여야 한다.',
            },
            stylePreset: {
              type: 'string',
              enum: ['감성', '여행', '일상'],
              description:
                '편집 스타일. 워커가 이 값으로 BGM 선곡·컷 호흡·색보정을 결정한다. 세 값 중 하나만 허용(다른 값은 400).',
            },
            subtitles: {
              type: 'boolean',
              default: false,
              description:
                '소프트 자막(mov_text 트랙) 생성 여부. 기본 false — 쇼츠용이라 자막이 필요 없고, 음성 인식(whisper)을 건너뛰어 편집이 더 빠르다. true면 한국어 음성을 인식해 별도 자막 트랙으로 삽입한다(영상에 굽지 않으므로 플레이어에서 자막을 켜야 보이고, SNS 업로드 시에는 유지되지 않음).',
            },
            outputProfile: {
              type: 'string',
              enum: ['short_vertical', 'youtube_landscape', 'instagram_portrait', 'square'],
              default: DEFAULT_OUTPUT_PROFILE,
              description: '출력 규격. 기본 short_vertical(1080x1920, 쇼츠용).',
            },
            fitMode: {
              type: 'string',
              enum: ['contain', 'cover', 'blur_background'],
              default: DEFAULT_FIT_MODE,
              description:
                '원본 비율이 출력 규격과 다를 때 채우는 방식. 기본 blur_background(흐린 배경 위에 원본).',
            },
          },
        },
        response: {
          202: successResponseSchema(JOB_CREATED_SCHEMA),
          400: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request, reply): Promise<ApiSuccess<{ jobId: string }>> => {
      const clips: ClipSpec[] = request.body.clips
        ? request.body.clips.map((clip) => ({
            videoId: clip.videoId,
            startMs: clip.startMs ?? 0,
            ...(clip.endMs !== undefined ? { endMs: clip.endMs } : {}),
          }))
        : (request.body.videoIds ?? []).map((videoId) => ({ videoId, startMs: 0 }));
      const data = await createEditJob({
        userId: request.user.id,
        clips,
        stylePreset: request.body.stylePreset,
        outputProfile: request.body.outputProfile ?? DEFAULT_OUTPUT_PROFILE,
        fitMode: request.body.fitMode ?? DEFAULT_FIT_MODE,
        subtitles: request.body.subtitles ?? false,
      });
      reply.status(202);
      return { success: true, data };
    },
  );

  // GET /edit-jobs/:id — 편집 작업 상태 조회
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id',
    {
      preHandler: app.authenticate,
      schema: {
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
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '`POST /edit-jobs`가 반환한 jobId(uuid)' },
          },
        },
        response: {
          200: successResponseSchema(EDIT_JOB_SCHEMA),
          404: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<EditJob>> => {
      const data = await getEditJob({ userId: request.user.id, jobId: request.params.id });
      return { success: true, data };
    },
  );

  // DELETE /edit-jobs/:id — 진행 중 편집 작업 취소
  app.delete<{ Params: { id: string } }>(
    '/edit-jobs/:id',
    {
      preHandler: app.authenticate,
      schema: {
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
          '- 크레딧 차감/환급 규칙은 크레딧 결제 정책 확정 후 이 엔드포인트에 연결된다.',
        ].join('\n'),
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '`POST /edit-jobs`가 반환한 jobId(uuid)' },
          },
        },
        response: {
          200: successResponseSchema({
            type: 'object',
            additionalProperties: false,
            required: ['canceled'],
            properties: { canceled: { type: 'boolean' } },
          }),
          404: API_ERROR_SCHEMA,
          409: API_ERROR_SCHEMA,
          ...AUTHENTICATED_ERROR_RESPONSES,
        },
      },
    },
    async (request): Promise<ApiSuccess<{ canceled: boolean }>> => {
      await cancelEditJob({ userId: request.user.id, jobId: request.params.id });
      return { success: true, data: { canceled: true } };
    },
  );

  // WebSocket GET /edit-jobs/:id/progress — 실시간 진행률 스트리밍
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id/progress',
    // WebSocket은 OpenAPI로 표현되지 않으므로 문서에서 숨김 (api-spec.md 참고)
    { websocket: true, preHandler: app.authenticate, schema: { hide: true } },
    async (connection, request) => {
      const ws = connection.socket;
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
