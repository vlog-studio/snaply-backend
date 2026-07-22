import { Redis } from 'ioredis';
import type { RedisConfig } from '../config.js';

let connections: Redis[] = [];
let redisUrl: string | null = null;

export function initRedis(config: RedisConfig): void {
  redisUrl = config.url;
}

/**
 * 새 ioredis 연결을 만든다. BullMQ와 pub/sub 구독자는 각각 전용 연결이 필요하다.
 * maxRetriesPerRequest: null 은 BullMQ 권장 설정.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) {
    throw new Error('redis가 초기화되지 않았습니다. initRedis(config)를 먼저 호출하세요.');
  }
  const conn = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connections.push(conn);
  return conn;
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all(connections.map((c) => c.quit().catch(() => undefined)));
  connections = [];
}

export function editProgressChannel(jobId: string): string {
  return `edit-progress:${jobId}`;
}
