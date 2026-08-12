/**
 * 고아 pending 영상 정리 배치 — presigned URL 만 발급되고 TTL(24시간)이 지나도록
 * 확정(POST /videos)되지 않은 pending 레코드와 남은 S3 객체를 삭제한다.
 *
 * presigned URL 발급(GET /videos/upload-url)은 레코드를 선생성하므로, 클라이언트가
 * 업로드에 실패하거나 confirm 을 생략하면 pending 행이 계속 쌓인다. 이 배치가 안전망이다
 * — docs/decisions/snap-source-of-truth.md §5 GC 병행 항목 ①.
 *
 * 사용법:
 *   npm run videos:purge-pending -w apps/api            # 대상만 보여주고 종료 (dry-run)
 *   npm run videos:purge-pending -w apps/api -- --yes   # 실제 삭제
 *
 * 운영에서는 스케줄러(cron)로 하루 1회 실행을 상정한다 (accounts:purge 와 동일).
 */
import { loadConfig } from '../src/config.js';
import { initStorage } from '../src/services/storage.service.js';
import {
  PENDING_VIDEO_TTL_HOURS,
  findStalePendingVideos,
  purgeStalePendingVideos,
} from '../src/services/video.service.js';
import { disconnectPrisma } from '../src/db/client.js';

const apply = process.argv.includes('--yes');

const config = loadConfig();
initStorage(config.storage);

try {
  const candidates = await findStalePendingVideos();
  console.log(`TTL(${PENDING_VIDEO_TTL_HOURS}시간) 경과 미확정 pending 영상: ${candidates.length}건`);
  for (const c of candidates) {
    console.log(`  ${c.id} (발급: ${c.createdAt.toISOString()})`);
  }

  if (candidates.length === 0) {
    process.exit(0);
  }
  if (!apply) {
    console.log('\ndry-run입니다. 실제로 지우려면 --yes 를 붙이세요.');
    process.exit(0);
  }

  const result = await purgeStalePendingVideos();
  console.log(`\n삭제 완료: ${result.purged.length}건, 실패: ${result.failed.length}건`);
  if (result.failed.length > 0) {
    console.error(`실패한 영상(다음 실행에서 재시도됨): ${result.failed.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await disconnectPrisma();
}
