import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, EditJob, StylePreset } from '@vlog-studio/shared-types';
import { createRedisConnection, editProgressChannel } from '../lib/redis.js';
import { createEditJob, getEditJob, getEditJobForOwner } from '../services/edit-job.service.js';

interface CreateEditJobBody {
  videoIds: string[];
  stylePreset: StylePreset;
}

export async function editJobRoutes(app: FastifyInstance): Promise<void> {
  // POST /edit-jobs — 편집 요청 (BullMQ 큐 적재)
  app.post<{ Body: CreateEditJobBody }>(
    '/edit-jobs',
    {
      preHandler: app.authenticate,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['videoIds', 'stylePreset'],
          properties: {
            videoIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              minItems: 1,
              maxItems: 10,
            },
            stylePreset: { type: 'string', enum: ['감성', '여행', '일상'] },
          },
        },
      },
    },
    async (request, reply): Promise<ApiSuccess<{ jobId: string }>> => {
      const data = await createEditJob({
        userId: request.user.id,
        plan: request.user.plan,
        videoIds: request.body.videoIds,
        stylePreset: request.body.stylePreset,
      });
      reply.status(202);
      return { success: true, data };
    },
  );

  // GET /edit-jobs/:id — 편집 작업 상태 조회
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id',
    { preHandler: app.authenticate },
    async (request): Promise<ApiSuccess<EditJob>> => {
      const data = await getEditJob({ userId: request.user.id, jobId: request.params.id });
      return { success: true, data };
    },
  );

  // WebSocket GET /edit-jobs/:id/progress — 실시간 진행률 스트리밍
  app.get<{ Params: { id: string } }>(
    '/edit-jobs/:id/progress',
    { websocket: true, preHandler: app.authenticate },
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
        ws.send(JSON.stringify({ progress: 100, step: '완료' }));
        ws.close();
        return;
      }
      if (job.status === 'failed') {
        ws.send(JSON.stringify({ status: 'failed', error: job.errorMessage ?? '편집 실패' }));
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
          if (parsed.progress === 100 || parsed.status === 'failed') {
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
