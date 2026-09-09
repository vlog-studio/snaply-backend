/**
 * 보관 기간 만료 정리 배치.
 *
 * 세 가지를 한 번에 돌린다 — 모두 같은 구조라 따로 스케줄할 이유가 없다:
 *   ① 스냅 원본 (업로드 후 15일, SNAP-9)
 *   ② 끝내지 않은 무비 결과물 (생성 후 30일, MOV-16)
 *   ③ 앞선 삭제에서 S3 만 실패해 남은 객체 (backlog E-3)
 *
 * **행은 지우지 않는다.** 사라지는 것은 파일이고 메타데이터는 툼스톤으로 남는다 —
 * 사용자가 무엇을 잃었는지 알아야 하고, 그 영상을 참조하던 무비의 컷도 깨지면 안 된다
 * (docs/specs/snap-library.md SNAP-12).
 *
 * 사용법:
 *   npm run media:purge-expired -w apps/api            # 대상만 보여주고 종료 (dry-run)
 *   npm run media:purge-expired -w apps/api -- --yes   # 실제 삭제
 *
 * 운영에서는 스케줄러(cron)로 하루 1회 실행을 상정한다 (accounts:purge 와 동일).
 */
import { loadConfig } from '../src/config.js';
import { initStorage } from '../src/services/storage.service.js';
import {
  MOVIE_RESULT_RETENTION_DAYS,
  SNAP_RETENTION_DAYS,
} from '../src/services/retention-policy.js';
import {
  findExpiredMovieResults,
  findExpiredSnaps,
  findOrphanedObjects,
  purgeExpiredMovieResults,
  purgeExpiredSnaps,
  purgeOrphanedObjects,
  type ExpiryCandidate,
  type PurgeOutcome,
} from '../src/services/retention.service.js';
import { disconnectPrisma } from '../src/db/client.js';

const apply = process.argv.includes('--yes');

const config = loadConfig();
initStorage(config.storage);

function report(label: string, candidates: ExpiryCandidate[]): void {
  console.log(`\n${label}: ${candidates.length}건`);
  for (const candidate of candidates.slice(0, 20)) {
    console.log(`  ${candidate.id} (기준 시각: ${candidate.since.toISOString()})`);
  }
  if (candidates.length > 20) {
    console.log(`  … 외 ${candidates.length - 20}건`);
  }
}

function summarize(label: string, outcome: PurgeOutcome): number {
  console.log(`${label}: 삭제 ${outcome.purged.length}건, 실패 ${outcome.failed.length}건`);
  if (outcome.failed.length > 0) {
    console.error(`  실패(다음 실행에서 재시도됨): ${outcome.failed.join(', ')}`);
  }
  return outcome.failed.length;
}

try {
  const [snaps, movieResults, orphans] = await Promise.all([
    findExpiredSnaps(),
    findExpiredMovieResults(),
    findOrphanedObjects(),
  ]);

  report(`① 보관 기간(${SNAP_RETENTION_DAYS}일) 지난 스냅 원본`, snaps);
  report(`② 끝내지 않은 채 ${MOVIE_RESULT_RETENTION_DAYS}일 지난 무비 결과물`, movieResults);
  report('③ 앞선 삭제에서 남은 S3 객체', orphans);

  const total = snaps.length + movieResults.length + orphans.length;
  if (total === 0) {
    console.log('\n지울 것이 없습니다.');
    process.exit(0);
  }
  if (!apply) {
    console.log('\ndry-run입니다. 실제로 지우려면 --yes 를 붙이세요.');
    process.exit(0);
  }

  console.log('');
  const failures =
    summarize('① 스냅', await purgeExpiredSnaps()) +
    summarize('② 무비 결과물', await purgeExpiredMovieResults()) +
    summarize('③ 남은 객체', await purgeOrphanedObjects());
  if (failures > 0) {
    process.exitCode = 1;
  }
} finally {
  await disconnectPrisma();
}
