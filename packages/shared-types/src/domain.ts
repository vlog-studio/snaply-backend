
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
