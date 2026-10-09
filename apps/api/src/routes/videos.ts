import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  VIDEO_LIST_DEFAULT_LIMIT,
  VIDEO_LOOKUP_MAX_IDS,
  createVideo,
  deleteVideo,
  getUploadUrl,
  TRASH_LIST_MAX,
  getVideo,
  listTrashedVideos,
  listVideos,
  lookupVideos,
  ok,
  restoreVideo,
} from '@vlog-studio/shared-types';
import {
  createUploadTarget,
  confirmUpload,
  listVideos as listVideosForUser,
  getVideo as getVideoForUser,
  deleteVideo as deleteVideoForUser,
  listTrashedVideos as listTrashedVideosForUser,
  lookupVideos as lookupVideosForUser,
  restoreVideo as restoreVideoForUser,
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
        capturedAt: request.body.capturedAt,
        clientId: request.body.clientId,
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
          '내가 올린 영상을 **업로드 최신순**으로 조회한다(같은 시각이면 `id` 역순). 삭제·만료된 영상은 제외 — 왜 사라졌는지는 `POST /videos/lookup` 으로 묻는다. 편집 결과물 영상도 같은 목록에 포함된다(`stylePreset`이 채워져 있고 `editedUrl`이 있는 항목). 스냅만 보려면 `kind=source`.',
          '',
          '`status: pending` 항목은 업로드 URL 만 발급되고 아직 등록되지 않은 것이다. 다른 기기로 스냅을 가져올 때는 `ready` 만 쓴다.',
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

  // POST /videos/lookup — 목록에서 사라진 영상의 이유
  routes.post(
    lookupVideos.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...lookupVideos.schema,
        tags: ['videos'],
        summary: '영상 상태 조회 (지워진 이유 포함)',
        description: [
          '영상 id 들이 **아직 있는지, 지워졌다면 왜인지**를 한 번에 묻는다. 목록과 상세는 지워진 영상을 숨기므로, 앱이 목록에서 사라진 스냅을 다른 기기에서 지운 것인지(`user`) 보관 기간이 끝난 것인지(`expired`) 구분할 때 쓴다.',
          '',
          '- 응답 순서는 요청 순서와 같지 않다. `id` 로 맞춘다.',
          '- **남의 id 와 없는 id 는 응답에서 빠진다** — 둘을 구분하지 않는다(존재 여부를 노출하지 않기 위함).',
          `- 한 번에 최대 ${VIDEO_LOOKUP_MAX_IDS}개. 더 많으면 나눠 부른다.`,
          '',
          '```json',
          '{ "success": true, "data": { "items": [',
          '  { "id": "uuid", "state": "live", "removalReason": null, "removedAt": null },',
          '  { "id": "uuid", "state": "removed", "removalReason": "expired", "removedAt": "2026-09-27T18:00:00.000Z" }',
          '] } }',
          '```',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await lookupVideosForUser({ userId: request.user.id, ids: request.body.ids });
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

  // DELETE /videos/:id — 소프트 삭제. 보관 기간 안의 스냅은 파일을 남겨 되살릴 수 있다(SNAP-20)
  routes.delete(
    deleteVideo.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...deleteVideo.schema,
        tags: ['videos'],
        summary: '영상 삭제',
        description: [
          '목록·상세에서 곧바로 사라지고, 그 스냅을 쓰던 무비의 컷은 `unavailable` 로 남는다. 다른 기기는',
          '`POST /videos/lookup` 의 `removed` 로 안다. 남의 영상은 404.',
          '',
          '**업로드가 끝났고 보관 기간 안인 스냅은 파일을 남긴다** — 원래 보관 기간이 끝날 때까지 `POST /videos/{id}/restore` 로',
          '되살릴 수 있고(`restorableUntil`), 그 뒤 정리 배치가 지운다. 그 밖의 영상(올라가는 중 · 보관 기간이 끝난 스냅 · 결과물)은',
          '파일을 바로 지우고 `restorableUntil: null` — 되돌릴 수 없다.',
          '',
          '**분석 결과는 어느 쪽이든 바로 파기한다**(ANA-3). 되살린 스냅은 분석이 필요해지면 다시 분석된다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const { restorableUntil } = await deleteVideoForUser({
        userId: request.user.id,
        videoId: request.params.id,
      });
      return ok({ deleted: true as const, restorableUntil });
    },
  );

  // GET /videos/trash — 최근 삭제(휴지통)
  routes.get(
    listTrashedVideos.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...listTrashedVideos.schema,
        tags: ['videos'],
        summary: '최근 삭제한 스냅',
        description: [
          '지웠지만 아직 되살릴 수 있는 스냅 — 원래 보관 기간이 끝나지 않은 것만, 지운 순서로 최근 것부터',
          `최대 ${TRASH_LIST_MAX}개. 보관 기간이 끝난 스냅과 파일을 남기지 않고 지운 영상은 나오지 않는다.`,
        ].join('\n'),
      },
    },
    async (request) => ok(await listTrashedVideosForUser({ userId: request.user.id })),
  );

  // POST /videos/:id/restore — 휴지통에서 되살리기
  routes.post(
    restoreVideo.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...restoreVideo.schema,
        tags: ['videos'],
        summary: '지운 스냅 되살리기',
        description: [
          '목록·무비 후보·다른 기기에 다시 나타난다. 지울 때 무비에서 빠진 컷은 돌아오지 않는다.',
          '이미 살아 있는 스냅이면 그대로 돌려준다(멱등). 보관 기간이 끝났거나 파일을 남기지 않고 지운 영상은',
          '409 `NOT_RESTORABLE`, 없거나 남의 영상은 404.',
        ].join('\n'),
      },
    },
    async (request) =>
      ok(await restoreVideoForUser({ userId: request.user.id, videoId: request.params.id })),
  );
}
