import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';

export interface RenditionJobData {
  /** videos.id — BullMQ job id 로도 쓴다(같은 스냅을 두 번 변환하지 않기 위해). */
  videoId: string;
  userId: string;
  /** 원본 객체 키. 워커가 이것만으로 내려받는다. */
  s3Key: string;
}

let queue: Queue<RenditionJobData> | null = null;

export function initRenditionQueue(queueName: string): Queue<RenditionJobData> {
  if (!queue) {
    queue = new Queue<RenditionJobData>(queueName, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

function getQueue(): Queue<RenditionJobData> {
  if (!queue) {
    throw new Error('렌디션 큐가 초기화되지 않았습니다. initRenditionQueue()를 먼저 호출하세요.');
  }
  return queue;
}

/**
 * 배포 렌디션 생성 작업 적재.
 *
 * **실패해도 업로드는 성공이다.** 렌디션이 없으면 다른 플랫폼에서 재생이 안 될 뿐,
 * 스냅 자체는 쓸 수 있고 편집도 원본으로 돈다. 그래서 호출자는 이 함수의 실패를 삼킨다.
 */
export async function enqueueRendition(data: RenditionJobData): Promise<void> {
  await getQueue().add('rendition', data, { jobId: data.videoId });
}

export async function closeRenditionQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
