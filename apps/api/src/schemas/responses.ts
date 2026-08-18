import { CREDIT_REASONS } from '../services/billing/credit-policy.js';

type JsonSchema = Readonly<Record<string, unknown>>;

const TRUE_SCHEMA = { type: 'boolean', enum: [true] } as const;

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

/**
 * 403 전용 에러 스키마. `ACCOUNT_PENDING_DELETION` 은 `AppError.details` 로 실삭제 예정 시각을
 * 함께 내리므로 `purgeAfter` 를 여기 선언해야 직렬화에서 살아남는다.
 * `AppError.forbidden()` 이 만드는 일반 403 도 같은 스키마를 쓰므로 optional 이다.
 */
export const FORBIDDEN_ERROR_SCHEMA = {
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
        /** 이 시각 이전에는 POST /auth/me/restore 로 복구 가능 */
        purgeAfter: { type: 'string', format: 'date-time' },
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
  403: FORBIDDEN_ERROR_SCHEMA,
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
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    nickname: { type: 'string', nullable: true },
    avatarUrl: { type: 'string', nullable: true },
    interests: { type: 'array', items: { type: 'string' } },
    notificationEnabled: { type: 'boolean' },
    quietStart: { type: 'integer', minimum: 0, maximum: 23 },
    quietEnd: { type: 'integer', minimum: 0, maximum: 23 },
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
    'errorCode',
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
    status: { type: 'string', enum: ['queued', 'processing', 'done', 'failed', 'canceled'] },
    progress: { type: 'integer', minimum: 0, maximum: 100 },
    errorMessage: { type: 'string', nullable: true },
    errorCode: {
      type: 'string',
      enum: ['TIMEOUT', 'SOURCE_UNAVAILABLE', 'QUEUE_FAILED', 'INTERNAL'],
      nullable: true,
      description: '실패 분류 코드. status가 failed일 때만 채워진다.',
    },
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

/** 크레딧 팩. 가격·통화는 스토어가 원천이라 응답에 넣지 않는다. */
export const CREDIT_PACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productId', 'credits', 'displayOrder'],
  properties: {
    productId: { type: 'string' },
    credits: { type: 'integer', minimum: 1 },
    displayOrder: { type: 'integer', minimum: 0 },
  },
} as const;

export const CREDIT_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'delta', 'reason', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    /** +지급 / -차감 */
    delta: { type: 'integer' },
    /**
     * 앱이 내역 화면 문구를 매핑하는 값이라 enum 으로 고정한다. 값을 늘릴 때는
     * `credit-policy.ts` 의 `CREDIT_REASON` 과 함께 고쳐야 한다 — 여기 없는 값은
     * 직렬화에서 살아남지 못한다.
     */
    reason: { type: 'string', enum: [...CREDIT_REASONS] },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const CREDIT_BALANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['balance', 'entries'],
  properties: {
    // 스토어 환불로 지급분이 회수되면 음수가 될 수 있다 — minimum 을 걸지 않는다.
    balance: { type: 'integer' },
    entries: {
      type: 'array',
      description: '최신순 **최대 50건**. 전체 내역이 아니다 — 페이지네이션은 없다.',
      items: CREDIT_ENTRY_SCHEMA,
    },
  },
} as const;

/** 광고 보상 가용성. 앱은 보상량·한도·쿨다운을 하드코딩하지 않고 이 응답만 본다. */
export const AD_REWARD_AVAILABILITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['enabled', 'rewardCredits', 'dailyLimit', 'remainingToday', 'nextAvailableAt', 'resetsAt'],
  properties: {
    /** false 면 앱은 진입점 자체를 숨긴다 (킬 스위치). */
    enabled: { type: 'boolean' },
    rewardCredits: { type: 'integer', minimum: 1 },
    dailyLimit: { type: 'integer', minimum: 1 },
    remainingToday: { type: 'integer', minimum: 0 },
    /** 쿨다운 중일 때만 채운다. null 이면 지금 가능. */
    nextAvailableAt: { type: 'string', format: 'date-time', nullable: true },
    /** 일일 한도 초기화 시각(KST 자정). */
    resetsAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const AD_REWARD_SESSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rewardId', 'nonce', 'ssvUserId', 'rewardCredits', 'expiresAt'],
  properties: {
    /** 상태 폴링용 식별자. SSV 비밀(`nonce`)과 분리돼 있다. */
    rewardId: { type: 'string', format: 'uuid' },
    /** AdMob SDK 의 `customData` 로 그대로 전달한다. */
    nonce: { type: 'string' },
    /** AdMob SDK 의 `userId` 로 그대로 전달한다. */
    ssvUserId: { type: 'string' },
    rewardCredits: { type: 'integer', minimum: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const AD_REWARD_STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rewardId', 'status', 'credits', 'balance'],
  properties: {
    rewardId: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: ['pending', 'abandoned', 'granted', 'expired', 'rejected'],
      description:
        '`pending` 은 실패가 아니다(SSV 대기). `abandoned` 는 앱이 슬롯을 비운 상태이며, '
        + '만료 전에 SSV 가 도착하면 그대로 `granted` 가 된다.',
    },
    /** granted 일 때만 채워진다. */
    credits: { type: 'integer', nullable: true },
    /** 항상 현재 잔액 — 앱이 별도 호출을 하지 않아도 되게. */
    balance: { type: 'integer' },
  },
} as const;

/**
 * 409 전용 에러 스키마. 세션 발급 거절은 `AppError.details` 로 "언제 다시 가능한지" 를
 * 함께 내리므로 여기 선언해야 직렬화에서 살아남는다 (`402 INSUFFICIENT_CREDITS` 와 같은 방식).
 */
export const CONFLICT_ERROR_SCHEMA = {
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
        /** AD_REWARD_COOLDOWN */
        nextAvailableAt: { type: 'string', format: 'date-time' },
        /** AD_REWARD_LIMIT_REACHED */
        resetsAt: { type: 'string', format: 'date-time' },
        /** AD_REWARD_SESSION_ACTIVE — 이 세션을 계속 폴링하면 된다 */
        rewardId: { type: 'string', format: 'uuid' },
      },
    },
  },
} as const;

export const CREDIT_SYNC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['granted', 'balance'],
  properties: {
    /** 이번 호출로 새로 지급된 거래 수. 0 이면 이미 모두 반영돼 있었다는 뜻이다. */
    granted: { type: 'integer', minimum: 0 },
    balance: { type: 'integer' },
  },
} as const;

/**
 * 402 전용 에러 스키마. `INSUFFICIENT_CREDITS` 는 `AppError.details` 로 필요량과 현재 잔액을
 * 함께 내리므로 여기 선언해야 직렬화에서 살아남는다 — 앱은 이 값으로
 * "N크레딧이 더 필요해요" 문구와 구매 유도를 그린다.
 */
export const PAYMENT_REQUIRED_ERROR_SCHEMA = {
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
        required: { type: 'integer', minimum: 0 },
        balance: { type: 'integer' },
      },
    },
  },
} as const;

export const WEBHOOK_RECEIVED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['received'],
  properties: { received: TRUE_SCHEMA },
} as const;
