import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config.js';

let client: S3Client | null = null;
let presignClient: S3Client | null = null;
let cfg: StorageConfig | null = null;

export function initStorage(config: StorageConfig): void {
  cfg = config;
  const clientOptions = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
  client = new S3Client({ ...clientOptions, endpoint: config.endpoint });
  presignClient = new S3Client({
    ...clientOptions,
    endpoint: config.publicEndpoint ?? config.endpoint,
  });
}

function ensureInit(): { client: S3Client; presignClient: S3Client; cfg: StorageConfig } {
  if (!client || !presignClient || !cfg) {
    throw new Error('storage가 초기화되지 않았습니다. initStorage(config)를 먼저 호출하세요.');
  }
  return { client, presignClient, cfg };
}

const EXT_RE = /\.[a-z0-9]{1,8}$/i;

/** 소유자 UUID를 경로에 포함해 격리: uploads/{userId}/{videoId}.mp4 */
export function buildUploadKey(userId: string, videoId: string, filename: string): string {
  const match = filename.match(EXT_RE);
  const ext = match ? match[0].toLowerCase() : '.mp4';
  return `uploads/${userId}/${videoId}${ext}`;
}

export interface PresignedUpload {
  uploadUrl: string;
  s3Key: string;
}

export async function createUploadUrl(params: {
  userId: string;
  videoId: string;
  filename: string;
  contentType: string;
}): Promise<PresignedUpload> {
  const { presignClient, cfg } = ensureInit();
  const s3Key = buildUploadKey(params.userId, params.videoId, params.filename);

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: s3Key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(presignClient, command, {
    expiresIn: cfg.presignExpirySeconds,
  });

  return { uploadUrl, s3Key };
}

/** Issue a client-reachable, time-limited URL for private object playback/download. */
export async function createDownloadUrl(s3Key: string): Promise<string> {
  const { presignClient, cfg } = ensureInit();
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: s3Key });
  return getSignedUrl(presignClient, command, {
    expiresIn: cfg.downloadUrlExpirySeconds,
  });
}

/** 업로드 완료 확인용: 객체 크기 반환. 객체가 없으면 null. */
export async function getObjectSize(s3Key: string): Promise<number | null> {
  const { client, cfg } = ensureInit();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: s3Key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(s3Key: string): Promise<void> {
  const { client, cfg } = ensureInit();
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: s3Key }));
}

export function publicUrl(s3Key: string): string {
  const { cfg } = ensureInit();
  return `${cfg.publicBaseUrl}/${s3Key}`;
}

export function maxUploadBytes(): number {
  return ensureInit().cfg.maxUploadBytes;
}

/** 개발 편의: 커스텀 endpoint(MinIO)일 때 버킷이 없으면 생성. */
export async function ensureBucketForDev(): Promise<void> {
  const { client, cfg } = ensureInit();
  if (!cfg.endpoint) {
    return; // 실제 AWS에서는 자동 생성하지 않음
  }
  try {
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
  }
}
