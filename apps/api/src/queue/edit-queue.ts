import { Queue } from 'bullmq';
import type { ClipSpec, EditSpec, RenderSpec, StylePreset } from '@vlog-studio/shared-types';
import { createRedisConnection } from '../lib/redis.js';

export interface EditJobData {
  jobId: string; // edit_jobs.id
  userId: string;
  /** pipeline v3 구간 편집 명세. */
  clips?: ClipSpec[];
  /** pipeline v1/v2에서 생성된 대기 작업과의 호환용. */
  videoIds?: string[];
  /** 이전 워커가 순차 배포 중에도 작업을 소비할 수 있도록 유지한다. */
  stylePreset: StylePreset;
  editSpec: EditSpec;
  renderSpec: RenderSpec;
  /** 소프트 자막(mov_text) 생성 여부. 쇼츠용이 기본이라 false가 디폴트. */
  subtitles: boolean;
}

/**
 * 편집 큐는 둘이다. editSpec v3(경계별 전환)는 **별도 큐**로 보낸다 — 구버전 워커는 v3 를 모르고
 * 최상위 필드만 읽어 v2 로 "성공"하므로, 큐 이름으로 아예 받지 못하게 한다(decisions/edit-spec-v3.md §4).
 */
let queues: { legacy: Queue<EditJobData>; v3: Queue<EditJobData> } | null = null;

function createQueue(queueName: string): Queue<EditJobData> {
  return new Queue<EditJobData>(queueName, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export function initEditQueue(queueName: string, v3QueueName: string): void {
  if (!queues) {
    queues = { legacy: createQueue(queueName), v3: createQueue(v3QueueName) };
  }
}

function getQueues(): { legacy: Queue<EditJobData>; v3: Queue<EditJobData> } {
  if (!queues) {
    throw new Error('edit 큐가 초기화되지 않았습니다. initEditQueue()를 먼저 호출하세요.');
  }
  return queues;
}

/** 이 작업이 갈 큐 — 스펙 버전이 정한다. */
export function editQueueFor(data: Pick<EditJobData, 'editSpec'>): Queue<EditJobData> {
  const { legacy, v3 } = getQueues();
  return data.editSpec.version === 3 ? v3 : legacy;
}

export async function enqueueEditJob(data: EditJobData): Promise<void> {
  // jobId를 BullMQ job id로도 사용해 중복 적재를 방지
  await editQueueFor(data).add('edit', data, { jobId: data.jobId });
}

/**
 * 대기 중인 작업을 큐에서 제거한다(최선 노력). 워커가 이미 잡은(active) 작업은
 * BullMQ 가 제거를 거부하므로 조용히 넘어간다 — DB 상태 변경이 원천이다.
 */
export async function removeEditJob(jobId: string): Promise<void> {
  for (const queue of Object.values(getQueues())) {
    try {
      const job = await queue.getJob(jobId);
      await job?.remove();
    } catch {
      // active 작업 제거 실패 등 — 무시
    }
  }
}

export async function closeEditQueue(): Promise<void> {
  if (queues) {
    await Promise.all([queues.legacy.close(), queues.v3.close()]);
    queues = null;
  }
}
