type JsonSchema = Readonly<Record<string, unknown>>;

const TRUE_SCHEMA = { type: 'boolean', enum: [true] } as const;
const PLAN_SCHEMA = { type: 'string', enum: ['free', 'standard', 'premium'] } as const;

export const API_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

export const COMMON_ERROR_RESPONSES = {
  429: API_ERROR_SCHEMA,
  500: API_ERROR_SCHEMA,
} as const;

export const AUTHENTICATED_ERROR_RESPONSES = {
  401: API_ERROR_SCHEMA,
  ...COMMON_ERROR_RESPONSES,
} as const;

export function successResponseSchema(data: JsonSchema): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['success', 'data'],
    properties: {
      success: TRUE_SCHEMA,
      data,
    },
  };
}

export const HEALTH_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'uptimeSeconds', 'db'],
  properties: {
    status: { type: 'string', enum: ['ok'] },
    uptimeSeconds: { type: 'integer', minimum: 0 },
    db: { type: 'string', enum: ['connected', 'not_configured', 'error'] },
  },
} as const;

export const USER_PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'nickname',
    'avatarUrl',
    'interests',
    'notificationEnabled',
    'quietStart',
    'quietEnd',
    'plan',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    nickname: { type: 'string', nullable: true },
    avatarUrl: { type: 'string', nullable: true },
    interests: { type: 'array', items: { type: 'string' } },
    notificationEnabled: { type: 'boolean' },
    quietStart: { type: 'integer', minimum: 0, maximum: 23 },
    quietEnd: { type: 'integer', minimum: 0, maximum: 23 },
    plan: PLAN_SCHEMA,
  },
} as const;

export const UPDATED_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['updated'],
  properties: { updated: TRUE_SCHEMA },
} as const;

export const ACCOUNT_DELETED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['deleted', 'purgeAfter'],
  properties: {
    deleted: TRUE_SCHEMA,
    /** 이 시각 이후 배치가 실삭제한다 — 그 전에는 복구 가능 */
    purgeAfter: { type: 'string', format: 'date-time' },
  },
} as const;

export const ACCOUNT_RESTORED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['restored'],
  properties: { restored: TRUE_SCHEMA },
} as const;

export const UPLOAD_TARGET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['videoId', 'uploadUrl', 's3Key'],
  properties: {
    videoId: { type: 'string', format: 'uuid' },
    uploadUrl: { type: 'string' },
    s3Key: { type: 'string' },
  },
} as const;

export const VIDEO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'originalUrls',
    'editedUrl',
    'thumbnailUrl',
    'durationSeconds',
    'stylePreset',
    'status',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    kind: { type: 'string', enum: ['source', 'result'] },
    originalUrls: { type: 'array', items: { type: 'string' } },
    editedUrl: { type: 'string', nullable: true },
    thumbnailUrl: { type: 'string', nullable: true },
    durationSeconds: { type: 'integer', nullable: true },
    stylePreset: {
      type: 'string',
      enum: ['감성', '여행', '일상'],
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['pending', 'ready', 'processing', 'done', 'failed'],
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const VIDEO_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'nextCursor'],
  properties: {
    items: { type: 'array', items: VIDEO_SCHEMA },
    nextCursor: { type: 'string', nullable: true },
  },
} as const;

export const DELETED_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['deleted'],
  properties: { deleted: TRUE_SCHEMA },
} as const;

export const JOB_CREATED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['jobId'],
  properties: { jobId: { type: 'string', format: 'uuid' } },
} as const;

const EDIT_SPEC_V1_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'stylePreset'],
  properties: {
    version: { type: 'integer', enum: [1] },
    stylePreset: { type: 'string', enum: ['감성', '여행', '일상'] },
  },
} as const;

const CLIP_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['videoId', 'startMs'],
  properties: {
    videoId: { type: 'string', format: 'uuid' },
    startMs: { type: 'integer', minimum: 0 },
    endMs: { type: 'integer', minimum: 1 },
  },
} as const;

const EDIT_SPEC_V2_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'stylePreset', 'clips'],
  properties: {
    version: { type: 'integer', enum: [2] },
    stylePreset: { type: 'string', enum: ['감성', '여행', '일상'] },
    clips: { type: 'array', items: CLIP_SPEC_SCHEMA, minItems: 1, maxItems: 10 },
  },
} as const;

const EDIT_SPEC_SCHEMA = {
  oneOf: [EDIT_SPEC_V1_SCHEMA, EDIT_SPEC_V2_SCHEMA],
} as const;

const RENDER_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profileVersion', 'outputProfile', 'width', 'height', 'fps', 'fitMode'],
  properties: {
    profileVersion: { type: 'integer', enum: [1] },
    outputProfile: {
      type: 'string',
      enum: ['short_vertical', 'youtube_landscape', 'instagram_portrait', 'square'],
    },
    width: { type: 'integer', minimum: 2 },
    height: { type: 'integer', minimum: 2 },
    fps: { type: 'integer', minimum: 1 },
    fitMode: { type: 'string', enum: ['contain', 'cover', 'blur_background'] },
  },
} as const;

export const EDIT_JOB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'videoId',
    'pipelineVersion',
    'editSpec',
    'renderSpec',
    'status',
    'progress',
    'errorMessage',
    'startedAt',
    'completedAt',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    videoId: { type: 'string', format: 'uuid' },
    pipelineVersion: { type: 'string' },
    editSpec: EDIT_SPEC_SCHEMA,
    renderSpec: RENDER_SPEC_SCHEMA,
    status: { type: 'string', enum: ['queued', 'processing', 'done', 'failed'] },
    progress: { type: 'integer', minimum: 0, maximum: 100 },
    errorMessage: { type: 'string', nullable: true },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const NEARBY_LOCATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'lat', 'lng', 'radiusMeters', 'category', 'distanceMeters'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    lat: { type: 'number' },
    lng: { type: 'number' },
    radiusMeters: { type: 'integer' },
    category: { type: 'string', enum: ['관광지', '카페', '여행지'] },
    distanceMeters: { type: 'integer', minimum: 0 },
  },
} as const;

export const GEOFENCE_RESULT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['notified'],
      properties: { notified: TRUE_SCHEMA },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['notified', 'reason'],
      properties: {
        notified: { type: 'boolean', enum: [false] },
        reason: {
          type: 'string',
          enum: [
            'notifications_disabled',
            'quiet_hours',
            'cooldown',
            'no_token',
            'send_failed',
          ],
        },
      },
    },
  ],
} as const;

export const SNS_CONNECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['platform', 'platformUsername', 'connectedAt'],
  properties: {
    platform: { type: 'string', enum: ['instagram', 'tiktok'] },
    platformUsername: { type: 'string', nullable: true },
    connectedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const AUTHORIZE_URL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['authorizeUrl'],
  properties: { authorizeUrl: { type: 'string' } },
} as const;

export const DISCONNECTED_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['disconnected'],
  properties: { disconnected: TRUE_SCHEMA },
} as const;

export const SNS_UPLOAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['uploadId', 'platform', 'status', 'platformPostId'],
  properties: {
    uploadId: { type: 'string', format: 'uuid' },
    platform: { type: 'string', enum: ['instagram', 'tiktok'] },
    status: { type: 'string', enum: ['success'] },
    platformPostId: { type: 'string', nullable: true },
  },
} as const;

export const PLAN_INFO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'name', 'priceKrw', 'features'],
  properties: {
    plan: PLAN_SCHEMA,
    name: { type: 'string' },
    priceKrw: { type: 'integer', minimum: 0 },
    features: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const SUBSCRIPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'status', 'currentPeriodEnd'],
  properties: {
    plan: PLAN_SCHEMA,
    // Stripe가 상태 문자열을 결정하므로 서버에서 확인 가능한 string 타입까지만 명세한다.
    status: { type: 'string' },
    currentPeriodEnd: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

export const CHECKOUT_URL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['checkoutUrl'],
  properties: { checkoutUrl: { type: 'string' } },
} as const;

export const CANCELING_DATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['canceling'],
  properties: { canceling: TRUE_SCHEMA },
} as const;

export const WEBHOOK_RECEIVED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['received'],
  properties: { received: TRUE_SCHEMA },
} as const;
