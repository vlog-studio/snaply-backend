import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';

export interface VideoAnalysisJobData {
  /** video_analyses.id — BullMQ job id 로도 쓴다(중복 적재 방지). */
  analysisId: string;
  videoId: string;
  userId: string;
  /** 이 작업이 채우는 분석 버전. 워커가 결과를 반영할 때 대조한다. */
  analysisVersion: number;
}

let queue: Queue<VideoAnalysisJobData> | null = null;

export function initVideoAnalysisQueue(queueName: string): Queue<VideoAnalysisJobData> {
  if (!queue) {
    queue = new Queue<VideoAnalysisJobData>(queueName, {
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

function getQueue(): Queue<VideoAnalysisJobData> {
  if (!queue) {
    throw new Error('분석 큐가 초기화되지 않았습니다. initVideoAnalysisQueue()를 먼저 호출하세요.');
  }
  return queue;
}

/**
 * 분석 작업 적재. `analysisId` 를 job id 로 써서 같은 분석이 두 번 실행되지 않게 한다.
 *
 * 이미 같은 id 의 job 이 큐에 남아 있으면 BullMQ 가 조용히 무시한다. 재시도 경로에서
 * 완료된 job 이 지워진 뒤라면 새로 적재된다.
 */
export async function enqueueVideoAnalysis(data: VideoAnalysisJobData): Promise<void> {
  await getQueue().add('analyze', data, { jobId: data.analysisId });
}

export async function closeVideoAnalysisQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
