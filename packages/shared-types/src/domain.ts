export type Plan = 'free' | 'standard' | 'premium';

export type VideoStatus = 'pending' | 'ready' | 'processing' | 'done' | 'failed' | 'deleted';

export type VideoKind = 'source' | 'result';

export type EditJobStatus = 'queued' | 'processing' | 'done' | 'failed';

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
  plan: Plan;
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
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EditProgressEvent {
  progress: number;
  step: string;
  outputUrl?: string;
  status?: 'failed';
  error?: string;
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
