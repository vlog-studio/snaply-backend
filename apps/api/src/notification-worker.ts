/**
 * 알림 발송 워커 — 편집 워커가 큐에 넣은 알림 요청을 꺼내 FCM 으로 보낸다.
 *
 * **왜 Python 워커가 직접 보내지 않는가**: FCM 서비스 계정을 두 서비스에 나눠 주게 되고,
 * 조용한 시간대·알림 설정 판정이 두 언어로 갈라진다. 갈라지면 한쪽만 고쳐져도 아무도 모른다.
 *
 * **왜 Redis pub/sub 이 아니라 큐인가**: pub/sub 은 구독자가 없는 순간의 메시지를 버리고,
 * API 를 여러 개 띄우면 같은 알림을 여러 번 보낸다. 큐는 둘 다 해결한다.
 *
 * **왜 API 프로세스 안이 아닌가**: `buildApp` 은 테스트도 부른다. 그 안에서 큐를 소비하기
 * 시작하면 테스트가 실제 작업을 집어삼킨다. 다른 워커들과 같이 별도 프로세스로 둔다.
 *
 * `scripts/` 가 아니라 `src/` 에 있는 이유: 배치가 아니라 **상주 프로세스**라 운영 이미지에
 * 들어가야 한다. `scripts/` 는 tsconfig 의 include 밖이라 `dist/` 로 컴파일되지 않는다.
 *
 * 사용법:
 *   npm run worker:notifications -w apps/api          # 로컬
 *   node dist/notification-worker.js                  # 컨테이너
 */
import { Worker } from 'bullmq';
import { loadConfig } from './config.js';
import { initFcm, isFcmDryRun } from './services/fcm.service.js';
import { notifyMovieReady } from './services/movie-ready-notice.service.js';
import { disconnectPrisma } from './db/client.js';

const config = loadConfig();
initFcm(config.firebase);

const logger = {
  info: (o: object, m?: string): void => console.log(m ?? '', JSON.stringify(o)),
  warn: (o: object, m?: string): void => console.warn(m ?? '', JSON.stringify(o)),
};

interface MovieReadyJob {
  type: 'movie_ready';
  userId: string;
  videoId: string;
}

const worker = new Worker(
  config.redis.notificationQueueName,
  async (job) => {
    const data = job.data as Partial<MovieReadyJob>;
    if (data.type !== 'movie_ready' || !data.userId || !data.videoId) {
      // 모르는 종류는 조용히 버린다 — 재시도해도 알게 되지 않는다.
      logger.warn({ jobId: job.id, type: data.type }, '알 수 없는 알림 요청');
      return;
    }
    const result = await notifyMovieReady({
      logger,
      userId: data.userId,
      videoId: data.videoId,
    });
    logger.info({ jobId: job.id, videoId: data.videoId, result }, '완료 알림 처리');
  },
  { connection: { url: config.redis.url } },
);

console.log(
  `알림 워커 시작 (queue=${config.redis.notificationQueueName}` +
    `${isFcmDryRun() ? ', FCM dry-run — 실제로 발송되지 않는다' : ''})`,
);

// 발송 실패는 BullMQ 가 재시도한다. 여기서는 원인이 보이게만 남긴다.
worker.on('failed', (job, err) => {
  logger.warn({ jobId: job?.id, err: err.message }, '알림 발송 실패');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void (async (): Promise<void> => {
      await worker.close();
      await disconnectPrisma();
      process.exit(0);
    })();
  });
}
