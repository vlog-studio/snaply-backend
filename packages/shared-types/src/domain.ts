
export type VideoStatus = 'pending' | 'ready' | 'processing' | 'done' | 'failed' | 'deleted';

export type VideoKind = 'source' | 'result';

export type EditJobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'canceled';

/**
 * 편집 실패의 분류 코드. 앱이 사용자 문구로 매핑하는 키이므로 append-only.
 * - TIMEOUT: 워커 처리 시간 초과
 * - SOURCE_UNAVAILABLE: 원본 클립을 찾을 수 없음 (삭제·소유권 변동 등)
 * - QUEUE_FAILED: 큐 적재 실패 (요청 시점 인프라 문제)
 * - INTERNAL: 그 외 서버 내부 오류
 */
export type EditJobErrorCode = 'TIMEOUT' | 'SOURCE_UNAVAILABLE' | 'QUEUE_FAILED' | 'INTERNAL';

export type StylePreset = '감성' | '여행' | '일상';

export type OutputProfile =
  | 'short_vertical'
  | 'youtube_landscape'
  | 'instagram_portrait'
  | 'square';

export type FitMode = 'contain' | 'cover' | 'blur_background';

export interface ClipSpec {
  videoId: string;
  startMs: number;
  endMs?: number;
}

export interface EditSpecV1 {
  version: 1;
  stylePreset: StylePreset;
}

export interface EditSpecV2 {
  version: 2;
  stylePreset: StylePreset;
  clips: ClipSpec[];
}

export type EditSpec = EditSpecV1 | EditSpecV2;

export interface RenderSpec {
  profileVersion: 1;
  outputProfile: OutputProfile;
  width: number;
  height: number;
  fps: number;
  fitMode: FitMode;
}

export const OUTPUT_PROFILE_CONFIGS: Record<
  OutputProfile,
  Readonly<Pick<RenderSpec, 'width' | 'height' | 'fps'>>
> = {
  short_vertical: { width: 1080, height: 1920, fps: 30 },
  youtube_landscape: { width: 1920, height: 1080, fps: 30 },
  instagram_portrait: { width: 1080, height: 1350, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
};

export const DEFAULT_OUTPUT_PROFILE: OutputProfile = 'short_vertical';
export const DEFAULT_FIT_MODE: FitMode = 'blur_background';

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

export type SnsPlatform = 'instagram' | 'tiktok';

export type SnsUploadStatus = 'pending' | 'success' | 'failed';

export type LocationCategory = '관광지' | '카페' | '여행지';

export interface UserProfile {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  interests: string[];
  notificationEnabled: boolean;
  quietStart: number;
  quietEnd: number;
}

export interface Video {
  id: string;
  kind: VideoKind;
  originalUrls: string[];
  editedUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  stylePreset: StylePreset | null;
  status: VideoStatus;
  createdAt: string;
}

export interface EditJob {
  id: string;
  videoId: string;
  pipelineVersion: string;
  editSpec: EditSpec;
  renderSpec: RenderSpec;
  status: EditJobStatus;
  progress: number;
  errorMessage: string | null;
  errorCode: EditJobErrorCode | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type VideoAnalysisStatus = 'queued' | 'processing' | 'done' | 'failed';

/**
 * 분석 실패 분류. `retryable` 이 true 인 코드만 재요청에 의미가 있다.
 * 워커의 `pipeline/video_analysis/errors.py` 와 같은 목록을 유지한다.
 */
export type VideoAnalysisErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK'
  | 'SCHEMA_INVALID'
  | 'AUTH_FAILED'
  | 'BAD_REQUEST'
  | 'MODEL_NOT_FOUND'
  | 'SAFETY_REFUSED'
  | 'EMPTY_OUTPUT'
  | 'SOURCE_UNAVAILABLE'
  | 'FRAME_EXTRACTION_FAILED'
  | 'INTERNAL';

/** 자동 편집 후보로 쓸 수 있는지의 판단. 오디오는 반영하지 않는다. */
export interface VideoVisualQuality {
  score: number;
  issues: string[];
  usableForEdit: boolean;
}

export interface VideoAnalysisResult {
  /** 워커가 FFprobe 로 실측한 길이. 클라이언트가 보고한 값이 아니다. */
  durationMs: number | null;
  frameTimestampsMs: number[];
  summary: string;
  topics: string[];
  places: string[];
  objects: string[];
  actions: string[];
  moods: string[];
  visualQuality: VideoVisualQuality;
  confidence: number | null;
}

export interface VideoAnalysis {
  id: string;
  videoId: string;
  version: number;
  status: VideoAnalysisStatus;
  /** status 가 'done' 일 때만 채워진다. */
  result: VideoAnalysisResult | null;
  error: { code: VideoAnalysisErrorCode; retryable: boolean } | null;
  /** 어떤 모델·프롬프트로 얻은 결과인지. 완료 전에는 null. */
  modelVersion: string | null;
  promptVersion: string | null;
  attempts: number;
  createdAt: string;
  completedAt: string | null;
}

export interface EditProgressEvent {
  progress: number;
  step: string;
  outputUrl?: string;
  status?: 'failed' | 'canceled';
  error?: string;
  /** status가 'failed'일 때의 분류 코드. */
  code?: EditJobErrorCode;
}

export interface NearbyLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  category: LocationCategory;
  distanceMeters: number;
}

/**
 * 무비 템플릿의 한 장면.
 *
 * `label`·`hint` 는 **사람에게 보여주는 촬영 지시**다. 슬롯에 들어간 스냅의 내용을 주장하지
 * 않는다 — `골목` 슬롯은 "여기에 골목을 찍어 오라"는 뜻이지 "이 스냅은 골목이다"가 아니다.
 *
 * 점수화가 쓰는 매칭 힌트(`match_hints`)는 이 계약에 없다. 내부값이고, 앱이 읽기 시작하면
 * 가중치 조정이 다시 앱 릴리스에 묶인다.
 */
export interface MovieTemplateSlot {
  /** 템플릿 안에서만 유일하다. 추천 응답이 슬롯을 가리키는 키다. */
  id: string;
  label: string;
  hint: string;
}

/** 사용자가 "템플릿으로 시작"할 때 고르는 무비의 형태. */
export interface MovieTemplate {
  /** 'walk' · 'cafe' 처럼 고정된 사람이 읽는 id. 앱의 내장 폴백 카탈로그와 같은 값이다. */
  id: string;
  name: string;
  description: string;
  /** `POST /edit-jobs` 가 받는 프리셋 그대로. 앱이 자기 표기로 변환한다. */
  style: StylePreset;
  /** 앱에서만 쓰는 트랙 키. 서버 편집 파이프라인은 BGM 을 받지 않는다. */
  bgm: string;
  /** 촬영 순서. `position` 오름차순이다. */
  slots: MovieTemplateSlot[];
}

/**
 * 카탈로그 응답. `updatedAt` 은 목록에서 가장 최근에 바뀐 템플릿의 시각이고, 앱은 이 값으로
 * 로컬 캐시를 갱신할지 판단한다.
 */
export interface MovieTemplateCatalog {
  updatedAt: string;
  templates: MovieTemplate[];
}

export type MovieRecommendationStatus = 'processing' | 'done' | 'failed';

/** 슬롯 하나에 대한 서버의 제안. `videoId` 가 null 이면 채울 후보가 없었다는 뜻이다. */
export interface MovieRecommendationSlot {
  slotId: string;
  videoId: string | null;
  /** 0~1. **슬롯 적합도**이며, 스냅이 무엇을 담고 있는지에 대한 주장이 아니다. */
  score: number | null;
}

/**
 * 배정에서 빠진 후보.
 * - `unusable` — 분석이 편집에 못 쓴다고 판단(흔들림·어두움·초점)
 * - `analysis_failed` — 분석이 실패했거나 제시간에 끝나지 않음
 * - `no_match` — 쓸 수는 있지만 슬롯보다 후보가 많아 자리가 없었음
 */
export interface MovieRecommendationExclusion {
  videoId: string;
  reason: 'unusable' | 'analysis_failed' | 'no_match';
}

/**
 * 템플릿 슬롯을 어떤 스냅으로 채울지에 대한 서버의 제안 1건.
 *
 * 앱은 이걸 기다리지 않는다 — 로컬 매칭이 먼저 화면을 채우고, 이 결과가 도착하면 사용자가
 * 손대지 않은 슬롯에만 얹힌다.
 */
export interface MovieRecommendation {
  id: string;
  templateId: string;
  status: MovieRecommendationStatus;
  /** 템플릿의 슬롯 순서 그대로. `status` 가 `done` 이 되기 전에는 비어 있다. */
  slots: MovieRecommendationSlot[];
  excluded: MovieRecommendationExclusion[];
  createdAt: string;
  completedAt: string | null;
}
