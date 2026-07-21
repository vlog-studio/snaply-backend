export type Plan = 'free' | 'standard' | 'premium';

export type VideoStatus = 'pending' | 'ready' | 'processing' | 'done' | 'failed';

export type EditJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type StylePreset = '감성' | '여행' | '일상';

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
