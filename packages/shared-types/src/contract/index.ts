/**
 * API 계약의 원천. 요청·응답 스키마는 여기 Zod 로 한 번만 적고, 백엔드 검증·직렬화·OpenAPI 와
 * 앱의 타입·런타임 검증이 전부 여기서 유도된다 (docs/decisions/api-contract-schema-first.md).
 *
 * 라우트 설명(summary·description·tags)은 계약의 형태가 아니라 문서이므로 백엔드 라우트 파일에
 * 남는다. WebSocket 계약(`editProgressEventSchema`)은 OpenAPI 에 없고 여기가 원천이다.
 */
export * from './define-route.js';
export * from './common.js';
export * from './vocab.js';
export * from './auth.js';
export * from './videos.js';
export * from './video-analyses.js';
export * from './edit-jobs.js';
export * from './locations.js';
export * from './sns.js';
export * from './billing.js';
export * from './movie-templates.js';
export * from './movie-recommendations.js';
export * from './health.js';

import { deleteMe, getMe, patchMe, registerFcmToken, restoreMe } from './auth.js';
import {
  abandonAdRewardSession,
  admobSsvCallback,
  createAdRewardSession,
  getAdRewardAvailability,
  getAdRewardStatus,
  getBillingProducts,
  getCredits,
  revenuecatWebhook,
  syncPurchases,
} from './billing.js';
import { cancelEditJob, createEditJob, getEditJob } from './edit-jobs.js';
import { getHealth } from './health.js';
import { listNearbyLocations, reportGeofenceEnter } from './locations.js';
import { getMovieRecommendation, requestMovieRecommendation } from './movie-recommendations.js';
import { getMovieTemplates } from './movie-templates.js';
import {
  disconnectSns,
  getSnsConnectUrl,
  listSnsConnections,
  snsOauthCallback,
  uploadToSns,
} from './sns.js';
import { getVideoAnalysis, requestVideoAnalysis } from './video-analyses.js';
import { createVideo, deleteVideo, getUploadUrl, getVideo, listVideos } from './videos.js';

/**
 * 모든 엔드포인트의 레지스트리. 앱의 `apiRequest` 는 이 객체의 타입에서 경로·메서드별
 * query·body·응답 `data` 타입을 유도한다.
 */
export const apiContract = {
  getHealth,
  getMe,
  patchMe,
  deleteMe,
  restoreMe,
  registerFcmToken,
  getUploadUrl,
  createVideo,
  listVideos,
  getVideo,
  deleteVideo,
  requestVideoAnalysis,
  getVideoAnalysis,
  createEditJob,
  getEditJob,
  cancelEditJob,
  getMovieTemplates,
  requestMovieRecommendation,
  getMovieRecommendation,
  listNearbyLocations,
  reportGeofenceEnter,
  listSnsConnections,
  getSnsConnectUrl,
  snsOauthCallback,
  disconnectSns,
  uploadToSns,
  getBillingProducts,
  getCredits,
  syncPurchases,
  getAdRewardAvailability,
  createAdRewardSession,
  getAdRewardStatus,
  abandonAdRewardSession,
  revenuecatWebhook,
  admobSsvCallback,
} as const;

export type ApiContract = typeof apiContract;
export type ApiRoute = ApiContract[keyof ApiContract];
