import { z } from 'zod';

/**
 * 모든 API 응답의 공통 봉투: `{ success: true, data }` 또는 `{ success: false, error }`.
 * 봉투의 형태는 저장소 전체에서 하나다 (constitution 제6조).
 */

const apiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z
  .object({ success: z.literal(false), error: apiErrorDetailSchema })
  .meta({ id: 'ApiError' });
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * `error` 에 부가 필드를 싣는 에러 봉투. `AppError.details` 로 내려가는 키는 해당 상태 코드의
 * 응답 스키마에 선언돼 있어야 직렬화에서 살아남는다 — 이 함수로 선언한다.
 */
export function apiErrorWith<T extends z.ZodRawShape>(extra: T) {
  return z.object({ success: z.literal(false), error: apiErrorDetailSchema.extend(extra) });
}

export function apiSuccess<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data });
}
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** 성공 봉투. 핸들러 반환 위치에서 `success: true` 리터럴이 `boolean` 으로 넓어지지 않게 한다. */
export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function cursorPaginated<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
export interface CursorPaginated<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * 403 전용. `ACCOUNT_PENDING_DELETION` 은 실삭제 예정 시각을 함께 내린다.
 * `AppError.forbidden()` 이 만드는 일반 403 도 같은 스키마를 쓰므로 optional 이다.
 */
export const forbiddenErrorSchema = apiErrorWith({
  purgeAfter: z.iso
    .datetime()
    .optional()
    .describe('ACCOUNT_PENDING_DELETION — 이 시각 이전에는 POST /auth/me/restore 로 복구 가능'),
});

/**
 * 409 전용. 세션 발급 거절은 "언제 다시 가능한지" 를 함께 내린다.
 * - `AD_REWARD_COOLDOWN` → `nextAvailableAt`
 * - `AD_REWARD_LIMIT_REACHED` → `resetsAt`
 * - `AD_REWARD_SESSION_ACTIVE` → `rewardId` (이 세션을 계속 폴링하면 된다)
 */
export const conflictErrorSchema = apiErrorWith({
  nextAvailableAt: z.iso.datetime().optional(),
  resetsAt: z.iso.datetime().optional(),
  rewardId: z.uuid().optional(),
});

/**
 * 402 전용. `INSUFFICIENT_CREDITS` 는 필요량과 현재 잔액을 함께 내린다 — 앱은 이 값으로
 * "N크레딧이 더 필요해요" 문구와 구매 유도를 그린다.
 */
export const paymentRequiredErrorSchema = apiErrorWith({
  required: z.int().min(0).optional(),
  balance: z.int().optional(),
});

export const COMMON_ERROR_RESPONSES = {
  429: apiErrorSchema,
  500: apiErrorSchema,
} as const;

export const AUTHENTICATED_ERROR_RESPONSES = {
  401: apiErrorSchema,
  403: forbiddenErrorSchema,
  ...COMMON_ERROR_RESPONSES,
} as const;
