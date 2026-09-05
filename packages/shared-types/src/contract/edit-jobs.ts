import { z } from 'zod';

import {
  AUTHENTICATED_ERROR_RESPONSES,
  apiErrorSchema,
  apiSuccess,
  paymentRequiredErrorSchema,
} from './common.js';
import { defineRoute } from './define-route.js';
import {
  DEFAULT_FIT_MODE,
  DEFAULT_OUTPUT_PROFILE,
  OUTPUT_PROFILE_CONFIGS,
  editJobErrorCodeSchema,
  editJobStatusSchema,
  fitModeSchema,
  outputProfileSchema,
  stylePresetSchema,
  type FitMode,
  type OutputProfile,
} from './vocab.js';

export const MAX_EDIT_CLIPS = 10;
const MAX_CLIP_MS = 86_400_000;

export const clipSpecSchema = z.object({
  videoId: z.uuid(),
  startMs: z.int().min(0),
  endMs: z.int().min(1).optional(),
});
export type ClipSpec = z.infer<typeof clipSpecSchema>;

export const editSpecV1Schema = z.object({
  version: z.literal(1),
  stylePreset: stylePresetSchema,
});
export type EditSpecV1 = z.infer<typeof editSpecV1Schema>;

export const editSpecV2Schema = z.object({
  version: z.literal(2),
  stylePreset: stylePresetSchema,
  clips: z.array(clipSpecSchema).min(1).max(MAX_EDIT_CLIPS),
});
export type EditSpecV2 = z.infer<typeof editSpecV2Schema>;

export const editSpecSchema = z.union([editSpecV1Schema, editSpecV2Schema]);
export type EditSpec = z.infer<typeof editSpecSchema>;

export const renderSpecSchema = z.object({
  profileVersion: z.literal(1),
  outputProfile: outputProfileSchema,
  width: z.int().min(2),
  height: z.int().min(2),
  fps: z.int().min(1),
  fitMode: fitModeSchema,
});
export type RenderSpec = z.infer<typeof renderSpecSchema>;

export function createRenderSpec(
  outputProfile: OutputProfile = DEFAULT_OUTPUT_PROFILE,
  fitMode: FitMode = DEFAULT_FIT_MODE,
): RenderSpec {
  return {
    profileVersion: 1,
    outputProfile,
    ...OUTPUT_PROFILE_CONFIGS[outputProfile],
    fitMode,
  };
}

export const editJobSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    pipelineVersion: z.string(),
    editSpec: editSpecSchema,
    renderSpec: renderSpecSchema,
    status: editJobStatusSchema,
    progress: z.int().min(0).max(100),
    errorMessage: z.string().nullable(),
    errorCode: editJobErrorCodeSchema.nullable().describe('실패 분류 코드. status가 failed일 때만 채워진다.'),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'EditJob' });
export type EditJob = z.infer<typeof editJobSchema>;

export const jobCreatedSchema = z.object({ jobId: z.uuid() });
export type JobCreated = z.infer<typeof jobCreatedSchema>;

export const editJobCanceledSchema = z.object({ canceled: z.boolean() });

export const createEditJobBodySchema = z
  .object({
    clips: z
      .array(
        z.object({
          videoId: z.uuid(),
          startMs: z.int().min(0).max(MAX_CLIP_MS).default(0),
          endMs: z.int().min(1).max(MAX_CLIP_MS).optional(),
        }),
      )
      .min(1)
      .max(MAX_EDIT_CLIPS)
      .optional()
      .describe(
        '이어붙일 클립 구간(권장). **배열 순서대로** 연결되며 같은 영상을 다른 구간으로 반복 사용할 수 있다. 1~10개.',
      ),
    videoIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_EDIT_CLIPS)
      .optional()
      .describe(
        '이어붙일 원본 클립 id 목록(구버전 호환 — `clips` 를 사용하세요). **배열 순서대로** 연결된다. 1~10개. 모두 `status: "ready"`이고 내 소유여야 한다.',
      ),
    stylePreset: stylePresetSchema.describe(
      '편집 스타일. 워커가 이 값으로 BGM 선곡·컷 호흡·색보정을 결정한다. 세 값 중 하나만 허용(다른 값은 400).',
    ),
    subtitles: z
      .boolean()
      .default(false)
      .describe(
        '소프트 자막(mov_text 트랙) 생성 여부. 기본 false — 쇼츠용이라 자막이 필요 없고, 음성 인식(whisper)을 건너뛰어 편집이 더 빠르다. true면 한국어 음성을 인식해 별도 자막 트랙으로 삽입한다(영상에 굽지 않으므로 플레이어에서 자막을 켜야 보이고, SNS 업로드 시에는 유지되지 않음).',
      ),
    outputProfile: outputProfileSchema
      .default(DEFAULT_OUTPUT_PROFILE)
      .describe('출력 규격. 기본 short_vertical(1080x1920, 쇼츠용).'),
    fitMode: fitModeSchema
      .default(DEFAULT_FIT_MODE)
      .describe('원본 비율이 출력 규격과 다를 때 채우는 방식. 기본 blur_background(흐린 배경 위에 원본).'),
  })
  .refine((body) => (body.clips === undefined) !== (body.videoIds === undefined), {
    message: 'clips 또는 videoIds 중 하나만 보내야 합니다.',
  });
export type CreateEditJobBody = z.input<typeof createEditJobBodySchema>;

const jobIdParamsSchema = z.object({
  id: z.string().describe('`POST /edit-jobs`가 반환한 jobId(uuid)'),
});

export const createEditJob = defineRoute({
  method: 'POST',
  path: '/edit-jobs',
  schema: {
    body: createEditJobBodySchema,
    response: {
      202: apiSuccess(jobCreatedSchema),
      400: apiErrorSchema,
      402: paymentRequiredErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const getEditJob = defineRoute({
  method: 'GET',
  path: '/edit-jobs/{id}',
  schema: {
    params: jobIdParamsSchema,
    response: {
      200: apiSuccess(editJobSchema),
      404: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

export const cancelEditJob = defineRoute({
  method: 'DELETE',
  path: '/edit-jobs/{id}',
  schema: {
    params: jobIdParamsSchema,
    response: {
      200: apiSuccess(editJobCanceledSchema),
      404: apiErrorSchema,
      409: apiErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});

/**
 * 진행률 WebSocket(`/edit-jobs/{id}/progress`)의 메시지. OpenAPI 로 표현되지 않으므로
 * 이 스키마가 그 계약의 원천이다 (안내는 docs/api-spec.md WebSocket 절).
 *
 * 메시지는 한 형태이고 어느 필드가 채워지는지로 종류를 읽는다:
 * - 진행: `progress`·`step`. 완료(`progress: 100`)에는 `outputUrl` 이 함께 온다
 * - 실패: `status: 'failed'` + 진단용 `error`(사용자 문구가 아니다), 분류 `code`
 * - 취소: `status: 'canceled'`. 서버가 발행하는 취소 이벤트는 `progress`·`step` 도 싣는다
 *
 * 앱은 `status` 를 먼저 보고, 없으면 진행 메시지로 읽는다.
 */
export const editProgressEventSchema = z.object({
  progress: z.number().optional(),
  step: z.string().optional(),
  outputUrl: z.string().optional(),
  status: z.enum(['failed', 'canceled']).optional(),
  error: z.string().optional(),
  code: editJobErrorCodeSchema.optional(),
});
export type EditProgressEvent = z.infer<typeof editProgressEventSchema>;
