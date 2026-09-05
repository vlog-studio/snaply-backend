import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  VIDEO_LIST_DEFAULT_LIMIT,
  createVideo,
  deleteVideo,
  getUploadUrl,
  getVideo,
  listVideos,
  ok,
} from '@vlog-studio/shared-types';
import {
  createUploadTarget,
  confirmUpload,
  listVideos as listVideosForUser,
  getVideo as getVideoForUser,
  deleteVideo as deleteVideoForUser,
} from '../services/video.service.js';

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // GET /videos/upload-url — presigned URL 발급 + pending 레코드 생성
  routes.get(
    getUploadUrl.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getUploadUrl.schema,
        tags: ['videos'],
        summary: 'presigned 업로드 URL 발급',
        description: [
          '영상 업로드 **1단계**. 파일은 서버를 거치지 않고 클라이언트가 S3(개발: MinIO)로 직접 올린다.',
          '',
          '이 호출은 두 가지를 한다:',
          '1. S3에 PUT할 수 있는 presigned URL 발급 (유효 15분)',
          '2. `status: "pending"` 영상 레코드 선생성 → 반환된 `videoId`를 2단계에서 사용',
          '',
          '**다음 단계**: 받은 `uploadUrl`에 파일을 PUT한다. 이때 `Content-Type` 헤더는 여기서 보낸 `contentType`과 **정확히 같아야** 서명이 유효하다.',
          '```bash',
          'curl -X PUT -T clip1.mp4 -H "Content-Type: video/mp4" "<uploadUrl>"',
          '```',
          '→ 업로드가 끝나면 `POST /videos`로 등록을 완료한다.',
          '',
          '_Swagger UI에서는 이 PUT을 실행할 수 없다(우리 API가 아닌 S3 직접 호출). 터미널이나 Postman을 사용._',
          '',
          '**응답 예시**',
          '```json',
          '{ "success": true, "data": {',
          '  "videoId": "8f14e45f-ceea-467a-9e1b-1c3a2b4d5e6f",',
          '  "uploadUrl": "http://localhost:9100/snaply-dev/uploads/...?X-Amz-Signature=...",',
          '  "s3Key": "uploads/{userId}/{videoId}.mp4"',
          '}}',
          '```',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await createUploadTarget({
        userId: request.user.id,
        filename: request.query.filename,
        contentType: request.query.contentType,
      });
      return ok(data);
    },
  );

  // POST /videos — 업로드 완료 후 메타데이터 등록 (status → ready)
  routes.post(
    createVideo.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...createVideo.schema,
        tags: ['videos'],
        summary: '업로드 완료 등록 (status → ready)',
        description: [
          '영상 업로드 **2단계**(마지막). S3 PUT이 끝난 뒤 호출해 영상을 사용 가능 상태로 만든다.',
          '',
          '서버가 하는 일:',
          '- S3에 실제로 객체가 있는지 확인 (없으면 400 — PUT을 빠뜨린 경우)',
          '- 용량이 500MB 이하인지 확인 (초과하면 S3 객체·DB 레코드를 삭제하고 400)',
          '- `status`를 `pending` → **`ready`** 로 전이하고 `originalUrls`를 채운다',
          '',
          '`ready` 상태가 되어야 `POST /edit-jobs`의 편집 대상으로 쓸 수 있다.',
          '',
          '성공 시 **201**과 Video 객체 반환:',
          '```json',
          '{ "success": true, "data": {',
          '  "id": "uuid", "originalUrls": ["http://..."], "editedUrl": null,',
          '  "thumbnailUrl": null, "durationSeconds": 12, "stylePreset": null,',
          '  "status": "ready", "createdAt": "2026-08-03T08:00:00.000Z"',
          '}}',
          '```',
        ].join('\n'),
      },
    },
    async (request, reply) => {
      const data = await confirmUpload({
        userId: request.user.id,
        videoId: request.body.videoId,
        durationSeconds: request.body.durationSeconds,
      });
      reply.status(201);
      return ok(data);
    },
  );

  // GET /videos — 내 영상 목록 (커서 페이지네이션)
  routes.get(
    listVideos.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...listVideos.schema,
        tags: ['videos'],
        summary: '내 영상 목록 (커서 페이지네이션)',
        description: [
          '내가 올린 영상을 **최신순**으로 조회한다. 삭제한 영상은 제외. 편집 결과물 영상도 같은 목록에 포함된다(`stylePreset`이 채워져 있고 `editedUrl`이 있는 항목).',
          '',
          '커서 방식이라 `nextCursor`가 `null`이 아니면 다음 페이지가 있다. 그 값을 `cursor`로 다시 넣어 호출한다.',
          '',
          '```json',
          '{ "success": true, "data": { "items": [ /* Video[] */ ], "nextCursor": "uuid|null" } }',
          '```',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await listVideosForUser({
        userId: request.user.id,
        kind: request.query.kind,
        cursor: request.query.cursor,
        limit: request.query.limit ?? VIDEO_LIST_DEFAULT_LIMIT,
      });
      return ok(data);
    },
  );

  // GET /videos/:id — 영상 상세
  routes.get(
    getVideo.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getVideo.schema,
        tags: ['videos'],
        summary: '영상 상세',
        description: [
          '영상 1건의 현재 상태를 조회한다. 편집 결과물의 `editedUrl`·`thumbnailUrl`이 채워졌는지 확인할 때 사용.',
          '',
          '`originalUrls`/`editedUrl`/`thumbnailUrl`은 **presigned GET URL**(기본 1시간 유효) — 만료되면 이 API를 다시 호출해 갱신한다.',
          '',
          '`status` 값의 의미:',
          '- `pending` — presigned URL만 발급된 상태 (아직 `POST /videos` 안 함)',
          '- `ready` — 업로드 완료, 편집에 사용 가능',
          '- `processing` — 편집 결과물 영상이 워커에서 처리 중',
          '- `done` — 편집 완료, `editedUrl` 사용 가능',
          '- `failed` — 편집 실패',
          '',
          '**남의 영상을 요청하면 403이 아니라 404**를 반환한다(리소스 존재 여부를 노출하지 않기 위함).',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await getVideoForUser({ userId: request.user.id, videoId: request.params.id });
      return ok(data);
    },
  );

  // DELETE /videos/:id — S3 삭제 + 소프트 삭제
  routes.delete(
    deleteVideo.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...deleteVideo.schema,
        tags: ['videos'],
        summary: '영상 삭제',
        description: [
          'S3 원본 객체를 **실제로 삭제**하고 DB 레코드는 소프트 삭제(`deletedAt` 기록)한다. 되돌릴 수 없다.',
          '',
          '삭제 후 목록·상세에서 사라지고, 남의 영상은 404. 응답: `{ "success": true, "data": { "deleted": true } }`',
        ].join('\n'),
      },
    },
    async (request) => {
      await deleteVideoForUser({ userId: request.user.id, videoId: request.params.id });
      return ok({ deleted: true });
    },
  );
}
