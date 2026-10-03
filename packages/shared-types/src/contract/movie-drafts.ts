import { z } from 'zod';

import { AUTHENTICATED_ERROR_RESPONSES, apiErrorWith, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';
import { stylePresetSchema } from './vocab.js';

/** 편집 초안 1회에 넘길 수 있는 스냅 수(docs/decisions/auto-edit-draft.md §5, 잠정값). */
export const MAX_DRAFT_SNAPS = 30;

/** 업로드가 끝난 스냅. 촬영 시각·신호는 서버가 안다. */
const uploadedDraftSnapSchema = z.object({
  videoId: z.uuid().describe('업로드가 끝난 스냅(`kind: source`)의 id.'),
});

/**
 * 업로드가 끝나지 않은 스냅. 서버는 이 스냅을 모르므로 촬영 시각만 받아 그 자리에 둔다 —
 * 빼지 않고 구간도 고르지 않는다(auto-edit-draft.md §5).
 */
const pendingDraftSnapSchema = z.object({
  localId: z.string().min(1).max(100).describe('앱이 붙인 스냅 id. 응답의 컷에 그대로 돌아온다.'),
  capturedAt: z.iso.datetime().describe('촬영 시각. 이 자리에 놓인다.'),
});

export const movieDraftBodySchema = z.object({
  stylePreset: stylePresetSchema.optional().describe('컷 길이를 정하는 스타일. 생략하면 `일상`.'),
  // 개수 상한은 여기서 걸지 않는다 — 서비스가 `TOO_MANY_SNAPS` + `max` 로 답해야 앱이 상한을 하드코딩하지 않는다.
  snaps: z
    .array(z.union([uploadedDraftSnapSchema, pendingDraftSnapSchema]))
    .min(1)
    .describe(`넘기는 스냅. 순서는 상관없다(서버가 촬영순으로 놓는다). 최대 ${MAX_DRAFT_SNAPS}개.`),
});
export type MovieDraftBody = z.infer<typeof movieDraftBodySchema>;

const uploadedDraftCutSchema = z.object({
  videoId: z.uuid(),
  startMs: z.int().min(0).optional().describe('자른 구간의 시작. 구간이 없으면 스냅 전체다.'),
  endMs: z.int().min(1).optional().describe('자른 구간의 끝.'),
});

const pendingDraftCutSchema = z.object({
  localId: z.string().describe('요청의 `localId`. 스냅 전체를 쓴다.'),
});

/**
 * 편집 초안의 제안. **무비가 아니다** — 앱이 이 컷들로 무비를 만들고(`POST /movies`, `arranger: ai`,
 * 컷마다 `trimOwner: ai`), 업로드가 끝나면 지금처럼 서버로 보낸다. 전환은 그때 서버가 고른다.
 */
export const movieDraftSchema = z
  .object({
    stylePreset: stylePresetSchema,
    cuts: z
      .array(z.union([uploadedDraftCutSchema, pendingDraftCutSchema]))
      .describe('쓸 스냅. **배열 순서가 곧 재생 순서**(촬영순)다. 최대 10개.'),
    excluded: z
      .array(z.union([z.object({ videoId: z.uuid() }), z.object({ localId: z.string() })]))
      .describe(
        '넣지 않은 스냅, 촬영순. 이유는 주지 않는다 — 앱은 개수를 알리고 다시 넣을 수 있게 한다. 업로드되지 않은 스냅(`localId`)은 그런 스냅만 10개를 넘을 때만 빠진다.',
      ),
    unavailable: z
      .array(z.object({ videoId: z.uuid() }))
      .describe(
        '넘긴 스냅 중 서버가 더는 쓸 수 없는 자기 스냅 — 지워졌거나(다른 기기에서 지움 · 보관 기간 만료) 준비되지 않았다. 나머지로 초안을 만들고, 이 스냅은 `cuts` 에도 `excluded` 에도 넣지 않는다(다시 넣을 수 없으므로). 넘긴 스냅이 모두 이렇다면 `cuts` 가 비어 있다. 남의 id 는 여기 오지 않고 요청 전체가 403 이다.',
      ),
  })
  .meta({ id: 'MovieDraft' });
export type MovieDraft = z.infer<typeof movieDraftSchema>;

export const draftSnapLimitErrorSchema = apiErrorWith({
  max: z.int().optional().describe('초안 1회에 넘길 수 있는 스냅 수'),
});

export const requestMovieDraft = defineRoute({
  method: 'POST',
  path: '/movie-drafts',
  schema: {
    body: movieDraftBodySchema,
    response: {
      200: apiSuccess(movieDraftSchema),
      400: draftSnapLimitErrorSchema,
      ...AUTHENTICATED_ERROR_RESPONSES,
    },
  },
});
