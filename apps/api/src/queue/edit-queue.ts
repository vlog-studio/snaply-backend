import { Queue } from 'bullmq';
import type { EditSpec, RenderSpec, StylePreset } from '@vlog-studio/shared-types';
import { createRedisConnection } from '../lib/redis.js';

export interface EditJobData {
  jobId: string; // edit_jobs.id
  userId: string;
  videoIds: string[];
  /** 이전 워커가 순차 배포 중에도 작업을 소비할 수 있도록 유지한다. */
  stylePreset: StylePreset;
  editSpec: EditSpec;
  renderSpec: RenderSpec;
}

let queue: Queue<EditJobData> | null = null;

export function initEditQueue(queueName: string): Queue<EditJobData> {
  if (!queue) {
    queue = new Queue<EditJobData>(queueName, {
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

function getQueue(): Queue<EditJobData> {
  if (!queue) {
    throw new Error('edit 큐가 초기화되지 않았습니다. initEditQueue()를 먼저 호출하세요.');
  }
  return queue;
}

export async function enqueueEditJob(data: EditJobData): Promise<void> {
  // jobId를 BullMQ job id로도 사용해 중복 적재를 방지
  await getQueue().add('edit', data, { jobId: data.jobId });
}

export async function closeEditQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
