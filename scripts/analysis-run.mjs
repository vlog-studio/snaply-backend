#!/usr/bin/env node
/**
 * 스냅 분석 실행·확인 (개발용).
 *
 * 앱은 아직 분석 API를 호출하지 않는다. 그래서 "앱으로 스냅을 올리고 그게 어떻게 분석됐는지
 * 보고 싶다" 를 이 스크립트 하나로 처리한다 — 분석 요청, 완료 대기, 결과 출력까지.
 *
 * API 를 거치지 않고 DB·큐를 직접 쓴다(토큰이 필요 없다). 대신 **분석 워커가 떠 있어야** 한다.
 *
 * 사용법:
 *   node scripts/analysis-run.mjs                  # 가장 최근 ready 스냅 1건 분석
 *   node scripts/analysis-run.mjs --video <uuid>   # 특정 스냅
 *   node scripts/analysis-run.mjs --list           # 최근 스냅 10건과 분석 상태만 보고 종료
 *   node scripts/analysis-run.mjs --show           # 요청하지 않고 현재 결과만 출력
 *   node scripts/analysis-run.mjs --reset          # 막힌 실패 행을 지우고 다시 요청
 *   node scripts/analysis-run.mjs --redis redis://localhost:6380   # 워커가 로컬 컨테이너 스택일 때
 *   node scripts/analysis-run.mjs --host 192.168.0.58              # 원격 배포 기기의 스택 전체
 *
 * 주의: **DB 와 큐가 같은 스택을 가리켜야 한다.** 워커를 `npm run stack` 으로 띄웠다면 큐는
 * 스택 Redis(호스트 6380)이고 DB 도 스택 Postgres(호스트 5433)다. `.env` 의 값(개발 인프라)을
 * 그대로 쓰면 분석 행은 이쪽 DB 에 생기고 작업은 저쪽 워커가 가져가 서로 못 찾는다.
 * `--host` 는 그 짝을 한 번에 맞춘다 — docker-compose.yml 이 게시하는 포트(5433/6380) 기준.
 */
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

// apps/api/.env 로드 (기존 환경변수를 덮지 않는다 — media-cleanup.mjs 와 같은 규칙)
const raw = await readFile(new URL('../apps/api/.env', import.meta.url), 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (/^["']/.test(v)) v = v.slice(1, v.lastIndexOf(v[0]));
  else v = v.replace(/\s+#.*$/, '').trim();
  process.env[m[1]] = v;
}

// --host 는 docker-compose.yml 이 호스트에 게시하는 포트로 DB·큐 주소를 한 번에 만든다.
// 계정이 compose 에 고정돼 있어(postgres/postgres) 파생이 안전하다. 다르면 개별 옵션으로 덮는다.
const STACK_HOST = value('--host', null);
const DATABASE_URL = value(
  '--database-url',
  STACK_HOST ? `postgresql://postgres:postgres@${STACK_HOST}:5433/snaply` : process.env.DATABASE_URL,
);
const REDIS_URL = value(
  '--redis',
  STACK_HOST ? `redis://${STACK_HOST}:6380` : (process.env.REDIS_URL ?? 'redis://localhost:6379'),
);
const QUEUE_NAME = process.env.VIDEO_ANALYSIS_QUEUE_NAME ?? 'video-analysis';
const TIMEOUT_MS = Number(value('--timeout', '120')) * 1000;
const ANALYSIS_VERSION = 1;

// 재시도해도 결과가 같은 코드 — video-analysis.service.ts 의 TERMINAL_ERROR_CODES 와 같아야 한다.
const TERMINAL_CODES = new Set([
  'AUTH_FAILED', 'BAD_REQUEST', 'MODEL_NOT_FOUND', 'SAFETY_REFUSED', 'FRAME_EXTRACTION_FAILED',
]);

const { PrismaClient } = await import(
  new URL('../node_modules/@prisma/client/default.js', import.meta.url).href
);
const { Queue } = await import('bullmq');
const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

/** 비밀번호를 가린 접속 주소. 어디를 보고 있는지 매번 찍는다 — 짝이 어긋나면 여기서 보인다. */
function safeUrl(url) {
  return String(url ?? '(미설정)').replace(/\/\/([^:]+):[^@]*@/, '//$1:***@');
}
console.log(`DB  ${safeUrl(DATABASE_URL)}`);
console.log(`큐  ${QUEUE_NAME} @ ${safeUrl(REDIS_URL)}`);

function line(label, text) {
  console.log(`  ${label.padEnd(10)}${text}`);
}

function printResult(row, video) {
  const took =
    row.startedAt && row.completedAt
      ? `${((row.completedAt - row.startedAt) / 1000).toFixed(1)}초`
      : '-';
  console.log('\n── 분석 결과 ─────────────────────────────────');
  line('영상', `${video.id}  (${video.s3Key ?? '-'})`);
  line('상태', `${row.status} · attempts ${row.attempts} · 소요 ${took}`);

  if (row.status !== 'done') {
    if (row.errorCode) {
      const terminal = TERMINAL_CODES.has(row.errorCode);
      line('실패코드', `${row.errorCode} ${terminal ? '(재시도 무의미)' : '(재시도 가능)'}`);
      // 제공자 오류 메시지에는 키 조각이 섞여 오기도 한다 — 붙여넣기 사고를 막는다.
      if (row.errorMessage) {
        line('메시지', row.errorMessage.replace(/sk-[A-Za-z0-9*_-]+/g, 'sk-***').slice(0, 200));
      }
      console.log('');
      if (row.errorCode === 'MODEL_NOT_FOUND') {
        console.log('  → .env 의 OPENAI_VISION_MODEL 을 실제 모델 ID 로 바꾸고 워커를 재기동한 뒤');
        console.log(`     node scripts/analysis-run.mjs --video ${video.id} --reset`);
      } else if (row.errorCode === 'AUTH_FAILED') {
        console.log('  → OPENAI_API_KEY 가 유효하지 않다. 워커 환경변수를 확인한다.');
      } else if (terminal) {
        console.log('  → 이 영상은 다시 분석해도 같은 결과다. 다른 스냅으로 확인한다.');
      } else {
        console.log(`  → 일시적 실패다. 다시: node scripts/analysis-run.mjs --video ${video.id}`);
      }
    }
    return;
  }

  line('모델', `${row.modelVersion ?? '-'} / prompt ${row.promptVersion ?? '-'}`);
  line('길이', `${row.durationMs}ms (실측)`);
  line('프레임', `${row.frameTimestampsMs.length}장 [${row.frameTimestampsMs.join(', ')}]`);
  line('토큰', `입력 ${row.inputTokens ?? '-'} · 출력 ${row.outputTokens ?? '-'}`);
  console.log('');
  line('요약', row.summary ?? '-');
  line('주제', row.topics.join(', ') || '-');
  line('장소', row.places.join(', ') || '-');
  line('사물', row.objects.join(', ') || '-');
  line('행동', row.actions.join(', ') || '-');
  line('분위기', row.moods.join(', ') || '-');
  console.log('');
  line(
    '편집사용',
    `${row.usableForEdit ? '가능' : '부적합'} · 품질 ${row.visualQualityScore ?? '-'}` +
      ` · 이슈 ${row.visualIssues.join(', ') || '없음'}`,
  );
  line('확신도', String(row.confidence ?? '-'));
}

async function listRecent() {
  const videos = await prisma.video.findMany({
    where: { kind: 'source', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true, status: true, createdAt: true,
      analyses: {
        orderBy: { analysisVersion: 'desc' },
        take: 1,
        select: { status: true, errorCode: true, summary: true },
      },
    },
  });
  if (videos.length === 0) {
    console.log('source 스냅이 없습니다. 앱에서 먼저 업로드하세요.');
    return;
  }
  console.log('최근 스냅 10건:\n');
  for (const v of videos) {
    const a = v.analyses[0];
    const state = a ? `${a.status}${a.errorCode ? `(${a.errorCode})` : ''}` : '분석없음';
    const summary = a?.summary ? ` — ${a.summary.slice(0, 30)}` : '';
    console.log(`  ${v.id}  ${v.status.padEnd(8)} ${state.padEnd(22)}${summary}`);
  }
}

async function main() {
  if (flag('--list')) {
    await listRecent();
    return;
  }

  const videoId = value('--video', null);
  const video = videoId
    ? await prisma.video.findFirst({
        where: { id: videoId, kind: 'source', deletedAt: null },
        select: { id: true, s3Key: true, status: true, userId: true },
      })
    : await prisma.video.findFirst({
        where: { kind: 'source', status: 'ready', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, s3Key: true, status: true, userId: true },
      });

  if (!video) {
    console.error(
      videoId
        ? `스냅을 찾을 수 없습니다: ${videoId}`
        : '분석할 ready 상태의 source 스냅이 없습니다. 앱에서 업로드를 완료했는지 확인하세요.',
    );
    process.exitCode = 1;
    return;
  }
  if (video.status !== 'ready') {
    console.error(`업로드가 확정되지 않은 스냅입니다 (status=${video.status}).`);
    process.exitCode = 1;
    return;
  }

  let row = await prisma.videoAnalysis.findUnique({
    where: {
      videoId_analysisVersion: { videoId: video.id, analysisVersion: ANALYSIS_VERSION },
    },
  });

  if (flag('--show')) {
    if (!row) {
      console.log('아직 분석 기록이 없습니다. --show 없이 실행하면 요청합니다.');
      return;
    }
    printResult(row, video);
    return;
  }

  if (row?.status === 'done' && !flag('--reset')) {
    console.log('이미 분석이 끝난 스냅입니다. (다시 돌리려면 --reset)');
    printResult(row, video);
    return;
  }
  if (row && flag('--reset')) {
    await prisma.videoAnalysis.delete({ where: { id: row.id } });
    console.log('기존 분석 행을 지웠습니다 (--reset).');
    row = null;
  }
  if (row?.status === 'failed' && TERMINAL_CODES.has(row.errorCode ?? '')) {
    console.log(`이 스냅은 ${row.errorCode} 로 막혀 있습니다. 원인을 고친 뒤 --reset 으로 다시 요청하세요.`);
    printResult(row, video);
    return;
  }

  row =
    row ??
    (await prisma.videoAnalysis.create({
      data: {
        videoId: video.id,
        userId: video.userId,
        analysisVersion: ANALYSIS_VERSION,
        status: 'queued',
      },
    }));
  if (row.status === 'failed') {
    row = await prisma.videoAnalysis.update({
      where: { id: row.id },
      data: { status: 'queued', errorCode: null, errorMessage: null },
    });
  }

  const queue = new Queue(QUEUE_NAME, {
    // 원격 스택을 겨냥할 때 주소가 틀리면 ioredis 가 조용히 무한 재시도한다 — 몇 초 만에 포기시킨다.
    connection: {
      url: REDIS_URL,
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : 200),
    },
  });
  // ioredis 가 재시도마다 스택을 찍는다. 연결 실패는 아래에서 한 줄로 보고하므로 기본 출력을 끈다.
  queue.on('error', () => {});
  try {
    try {
      await queue.waitUntilReady();
    } catch (err) {
      console.error(`\nRedis 에 접속할 수 없습니다: ${safeUrl(REDIS_URL)}`);
      console.error(`  ${err.message}`);
      console.error('  → 스택이 그 주소에 떠 있는지, 6380 포트가 게시·개방돼 있는지 확인하세요.');
      process.exitCode = 1;
      return;
    }
    // 워커가 없으면 작업은 큐에 쌓이기만 한다 — 폴링으로 기다리기 전에 알려준다.
    const workers = await queue.getWorkers().catch(() => []);
    console.log(`연결된 분석 워커: ${workers.length}개`);
    if (workers.length === 0) {
      console.log('⚠ 이 Redis 에 분석 워커가 없습니다. 작업이 쌓이기만 합니다.');
      console.log('  로컬 스택: --redis redis://localhost:6380 / 원격 스택: --host <ip>');
    }
    await queue.add(
      'analyze',
      {
        analysisId: row.id,
        videoId: video.id,
        userId: video.userId,
        analysisVersion: ANALYSIS_VERSION,
      },
      { jobId: row.id, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    console.log(`분석 요청 적재: ${row.id}`);
  } finally {
    await queue.close();
  }

  const deadline = Date.now() + TIMEOUT_MS;
  let lastStatus = row.status;
  while (Date.now() < deadline) {
    await sleep(1000);
    row = await prisma.videoAnalysis.findUnique({ where: { id: row.id } });
    if (!row) {
      console.error('분석 행이 사라졌습니다 (영상이 삭제됐을 수 있습니다).');
      process.exitCode = 1;
      return;
    }
    if (row.status !== lastStatus) {
      console.log(`  상태: ${lastStatus} → ${row.status}`);
      lastStatus = row.status;
    }
    if (row.status === 'done' || row.status === 'failed') {
      printResult(row, video);
      if (row.status === 'failed') process.exitCode = 1;
      return;
    }
  }

  console.log(`\n${TIMEOUT_MS / 1000}초 안에 끝나지 않았습니다 (현재 ${row.status}).`);
  console.log(`나중에 결과만 보려면: node scripts/analysis-run.mjs --video ${video.id} --show`);
  process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  // Prisma 초기화 오류는 번들 전체를 토해낸다. 원격 주소 오타에서 가장 흔한 실패라 짧게 줄인다.
  const unreachable =
    err?.name === 'PrismaClientInitializationError' ||
    /Can't reach database server/.test(err?.message ?? '');
  if (!unreachable) throw err;
  console.error(`\nDB 에 접속할 수 없습니다: ${safeUrl(DATABASE_URL)}`);
  console.error('  → 스택이 그 주소에 떠 있는지, 5433 포트가 게시·개방돼 있는지 확인하세요.');
  console.error('     원격 기기라면 방화벽과 compose 의 포트 게시(5433:5432)를 함께 봅니다.');
  console.error('     계정·DB 이름이 compose 기본값과 다르면 --database-url 로 직접 지정하세요.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
