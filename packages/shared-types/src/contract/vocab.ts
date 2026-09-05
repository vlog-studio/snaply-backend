import { z } from 'zod';

/**
 * 계약에 쓰이는 닫힌 값 집합. 응답 스키마의 enum 이 곧 와이어 계약이므로, 값을 늘릴 때는
 * 여기 하나만 고친다 — 백엔드 직렬화·OpenAPI·앱 타입이 전부 이 파일에서 나온다.
 */

/** 와이어에 나가는 영상 상태. 삭제된 영상은 목록·상세에서 제외되므로 `deleted` 는 여기 없다. */
export const VIDEO_STATUSES = ['pending', 'ready', 'processing', 'done', 'failed'] as const;
export const videoStatusSchema = z.enum(VIDEO_STATUSES);
export type VideoStatus = z.infer<typeof videoStatusSchema>;

export const VIDEO_KINDS = ['source', 'result'] as const;
export const videoKindSchema = z.enum(VIDEO_KINDS);
export type VideoKind = z.infer<typeof videoKindSchema>;

export const EDIT_JOB_STATUSES = ['queued', 'processing', 'done', 'failed', 'canceled'] as const;
export const editJobStatusSchema = z.enum(EDIT_JOB_STATUSES);
export type EditJobStatus = z.infer<typeof editJobStatusSchema>;

/**
 * 편집 실패의 분류 코드. 앱이 사용자 문구로 매핑하는 키이므로 append-only.
 * - TIMEOUT: 워커 처리 시간 초과
 * - SOURCE_UNAVAILABLE: 원본 클립을 찾을 수 없음 (삭제·소유권 변동 등)
 * - QUEUE_FAILED: 큐 적재 실패 (요청 시점 인프라 문제)
 * - INTERNAL: 그 외 서버 내부 오류
 */
export const EDIT_JOB_ERROR_CODES = ['TIMEOUT', 'SOURCE_UNAVAILABLE', 'QUEUE_FAILED', 'INTERNAL'] as const;
export const editJobErrorCodeSchema = z.enum(EDIT_JOB_ERROR_CODES);
export type EditJobErrorCode = z.infer<typeof editJobErrorCodeSchema>;

export const STYLE_PRESETS = ['감성', '여행', '일상'] as const;
export const stylePresetSchema = z.enum(STYLE_PRESETS);
export type StylePreset = z.infer<typeof stylePresetSchema>;

export const OUTPUT_PROFILES = [
  'short_vertical',
  'youtube_landscape',
  'instagram_portrait',
  'square',
] as const;
export const outputProfileSchema = z.enum(OUTPUT_PROFILES);
export type OutputProfile = z.infer<typeof outputProfileSchema>;

export const FIT_MODES = ['contain', 'cover', 'blur_background'] as const;
export const fitModeSchema = z.enum(FIT_MODES);
export type FitMode = z.infer<typeof fitModeSchema>;

export const OUTPUT_PROFILE_CONFIGS: Record<
  OutputProfile,
  Readonly<{ width: number; height: number; fps: number }>
> = {
  short_vertical: { width: 1080, height: 1920, fps: 30 },
  youtube_landscape: { width: 1920, height: 1080, fps: 30 },
  instagram_portrait: { width: 1080, height: 1350, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
};

export const DEFAULT_OUTPUT_PROFILE: OutputProfile = 'short_vertical';
export const DEFAULT_FIT_MODE: FitMode = 'blur_background';

export const VIDEO_ANALYSIS_STATUSES = ['queued', 'processing', 'done', 'failed'] as const;
export const videoAnalysisStatusSchema = z.enum(VIDEO_ANALYSIS_STATUSES);
export type VideoAnalysisStatus = z.infer<typeof videoAnalysisStatusSchema>;

/**
 * 분석 실패 분류. `retryable` 이 true 인 코드만 재요청에 의미가 있다.
 * 워커의 `pipeline/video_analysis/errors.py` 와 같은 목록을 유지한다.
 *
 * 와이어에서는 `string` 으로 열어 둔다 — 워커가 새 코드를 내기 시작했을 때 조회가 500 으로
 * 죽는 것보다 앱이 모르는 코드를 `INTERNAL` 로 읽는 쪽이 낫다. 이 목록은 알려진 값의 사전이다.
 */
export const VIDEO_ANALYSIS_ERROR_CODES = [
  'TIMEOUT',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'NETWORK',
  'SCHEMA_INVALID',
  'AUTH_FAILED',
  'BAD_REQUEST',
  'MODEL_NOT_FOUND',
  'SAFETY_REFUSED',
  'EMPTY_OUTPUT',
  'SOURCE_UNAVAILABLE',
  'FRAME_EXTRACTION_FAILED',
  'INTERNAL',
] as const;
export type VideoAnalysisErrorCode = (typeof VIDEO_ANALYSIS_ERROR_CODES)[number];

export const SNS_PLATFORMS = ['instagram', 'tiktok'] as const;
export const snsPlatformSchema = z.enum(SNS_PLATFORMS);
export type SnsPlatform = z.infer<typeof snsPlatformSchema>;

export const SNS_UPLOAD_STATUSES = ['pending', 'success', 'failed'] as const;
export const snsUploadStatusSchema = z.enum(SNS_UPLOAD_STATUSES);
export type SnsUploadStatus = z.infer<typeof snsUploadStatusSchema>;

export const LOCATION_CATEGORIES = ['관광지', '카페', '여행지'] as const;
export const locationCategorySchema = z.enum(LOCATION_CATEGORIES);
export type LocationCategory = z.infer<typeof locationCategorySchema>;

export const GEOFENCE_SKIP_REASONS = [
  'notifications_disabled',
  'quiet_hours',
  'cooldown',
  'no_token',
  'send_failed',
] as const;
export const geofenceSkipReasonSchema = z.enum(GEOFENCE_SKIP_REASONS);
export type GeofenceSkipReason = z.infer<typeof geofenceSkipReasonSchema>;

/** 크레딧 원장 `reason`. 앱이 내역 화면 문구를 매핑하는 값이라 닫힌 집합이다(VARCHAR(30) 안). */
export const CREDIT_REASON = {
  purchase: 'purchase',
  signupBonus: 'signup_bonus',
  exportReserve: 'export_reserve',
  exportRefund: 'export_refund',
  storeRefundRevoke: 'store_refund_revoke',
  promo: 'promo',
  adReward: 'ad_reward',
} as const;
export const CREDIT_REASONS = Object.values(CREDIT_REASON) as [CreditReason, ...CreditReason[]];
export type CreditReason = (typeof CREDIT_REASON)[keyof typeof CREDIT_REASON];
export const creditReasonSchema = z.enum(CREDIT_REASONS);

export const AD_REWARD_STATUSES = ['pending', 'abandoned', 'granted', 'expired', 'rejected'] as const;
export const adRewardStatusSchema = z.enum(AD_REWARD_STATUSES);
export type AdRewardStatus = z.infer<typeof adRewardStatusSchema>;

export const MOVIE_RECOMMENDATION_STATUSES = ['processing', 'done', 'failed'] as const;
export const movieRecommendationStatusSchema = z.enum(MOVIE_RECOMMENDATION_STATUSES);
export type MovieRecommendationStatus = z.infer<typeof movieRecommendationStatusSchema>;

/**
 * 배정에서 빠진 후보의 사유.
 * - `unusable` — 분석이 편집에 못 쓴다고 판단(흔들림·어두움·초점)
 * - `analysis_failed` — 분석이 실패했거나 제시간에 끝나지 않음
 * - `no_match` — 쓸 수는 있지만 슬롯보다 후보가 많아 자리가 없었음
 */
export const RECOMMENDATION_EXCLUSION_REASONS = ['unusable', 'analysis_failed', 'no_match'] as const;
export const recommendationExclusionReasonSchema = z.enum(RECOMMENDATION_EXCLUSION_REASONS);
export type RecommendationExclusionReason = z.infer<typeof recommendationExclusionReasonSchema>;
