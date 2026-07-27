import type { FastifyInstance } from 'fastify';
import type { ApiSuccess, CursorPaginated, Video } from '@vlog-studio/shared-types';
import {
  createUploadTarget,
  confirmUpload,
  listVideos,
  getVideo,
  deleteVideo,
  type UploadTarget,
} from '../services/video.service.js';

interface UploadUrlQuery {
  filename: string;
  contentType: string;
}

interface CreateVideoBody {
  videoId: string;
  durationSeconds?: number;
}

interface ListQuery {
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  // GET /videos/upload-url — presigned URL 발급 + pending 레코드 생성
  app.get<{ Querystring: UploadUrlQuery }>(
    '/videos/upload-url',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['videos'],
        summary: 'presigned 업로드 URL 발급',
        querystring: {
          type: 'object',
          required: ['filename', 'contentType'],
          properties: {
            filename: { type: 'string', minLength: 1, maxLength: 255 },
            contentType: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request): Promise<ApiSuccess<UploadTarget>> => {
      const data = await createUploadTarget({
        userId: request.user.id,
        filename: request.query.filename,
        contentType: request.query.contentType,
      });
      return { success: true, data };
    },
  );

  // POST /videos — 업로드 완료 후 메타데이터 등록 (status → ready)
  app.post<{ Body: CreateVideoBody }>(
    '/videos',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['videos'],
        summary: '업로드 완료 등록 (status → ready)',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['videoId'],
          properties: {
            videoId: { type: 'string', format: 'uuid' },
            durationSeconds: { type: 'integer', minimum: 0, maximum: 86400 },
          },
        },
      },
    },
    async (request, reply): Promise<ApiSuccess<Video>> => {
      const data = await confirmUpload({
        userId: request.user.id,
        videoId: request.body.videoId,
        durationSeconds: request.body.durationSeconds,
      });
      reply.status(201);
      return { success: true, data };
    },
  );

  // GET /videos — 내 영상 목록 (커서 페이지네이션)
  app.get<{ Querystring: ListQuery }>(
    '/videos',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['videos'],
        summary: '내 영상 목록 (커서 페이지네이션)',
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
          },
        },
      },
    },
    async (request): Promise<ApiSuccess<CursorPaginated<Video>>> => {
      const data = await listVideos({
        userId: request.user.id,
        cursor: request.query.cursor,
        limit: request.query.limit ?? DEFAULT_LIMIT,
      });
      return { success: true, data };
    },
  );

  // GET /videos/:id — 영상 상세
  app.get<{ Params: { id: string } }>(
    '/videos/:id',
    { preHandler: app.authenticate, schema: { tags: ['videos'], summary: '영상 상세' } },
    async (request): Promise<ApiSuccess<Video>> => {
      const data = await getVideo({ userId: request.user.id, videoId: request.params.id });
      return { success: true, data };
    },
  );

  // DELETE /videos/:id — S3 삭제 + 소프트 삭제
  app.delete<{ Params: { id: string } }>(
    '/videos/:id',
    { preHandler: app.authenticate, schema: { tags: ['videos'], summary: '영상 삭제' } },
    async (request): Promise<ApiSuccess<{ deleted: true }>> => {
      await deleteVideo({ userId: request.user.id, videoId: request.params.id });
      return { success: true, data: { deleted: true } };
    },
  );
}
