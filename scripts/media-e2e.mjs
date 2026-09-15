#!/usr/bin/env node
/**
 * 미디어/편집 파이프라인(Phase 3~5) end-to-end 개발용 헬퍼.
 *
 * 클립 파일 경로만 주면 아래를 한 번에 수행한다:
 *   1. Supabase 로그인 → JWT 발급
 *   2. 클립별: GET /videos/upload-url → S3 직접 PUT → POST /videos (status: ready)
 *   3. POST /movies (컷 목록) → POST /movies/:id/export → GET /edit-jobs/:id 폴링
 *   4. GET /movies/:id 로 결과물을 찾아 editedUrl 출력
 *
 * 앱이 쓰는 경로와 같다. 옛 `POST /edit-jobs` 직접 호출은 한 릴리스 더 살아 있지만
 * (docs/backlog.md A-1), 검증은 앱이 실제로 가는 길을 따라가야 의미가 있다.
 *
 * 사용법:
 *   node scripts/media-e2e.mjs clip1.mov clip2.mp4
 *   node scripts/media-e2e.mjs --style 여행 --upload-only clip1.mov
 *
 * 인증정보는 환경변수로 받는다(스크립트에 하드코딩하지 않는다):
 *   TEST_EMAIL / TEST_PASSWORD  또는  --email / --password
 */
import { readFile } from 'node:fs/promises';
import { createReadStream, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ENV_PATH = 'apps/api/.env';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const CONTENT_TYPES = {
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
};

// ── 로깅 ────────────────────────────────────────────────
const c = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', off: '\x1b[0m' };
const step = (msg) => console.log(`\n${c.cyan}▶ ${msg}${c.off}`);
const info = (msg) => console.log(`  ${msg}`);
const dim = (msg) => console.log(`  ${c.dim}${msg}${c.off}`);
const ok = (msg) => console.log(`  ${c.green}✓${c.off} ${msg}`);

function fail(msg, detail) {
  console.error(`\n${c.red}✗ ${msg}${c.off}`);
  if (detail) console.error(`  ${detail}`);
  process.exit(1);
}

// ── 인자 파싱 ───────────────────────────────────────────
function parseArgs(argv) {
  const opts = { style: '감성', uploadOnly: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--style') opts.style = argv[++i];
    else if (a === '--email') opts.email = argv[++i];
    else if (a === '--password') opts.password = argv[++i];
    else if (a === '--token') opts.token = argv[++i];
    else if (a === '--upload-only') opts.uploadOnly = true;
    else if (a === '--subtitles') opts.subtitles = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) fail(`알 수 없는 옵션: ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

const USAGE = `사용법: node scripts/media-e2e.mjs [옵션] <클립 파일...>

옵션:
  --style <감성|여행|일상>  편집 스타일 (기본: 감성)
  --subtitles               소프트 자막 생성 (기본: 안 함 — 쇼츠용)
  --upload-only             업로드·등록까지만 하고 편집 요청은 건너뜀
  --email / --password      로그인 정보 (없으면 TEST_EMAIL/TEST_PASSWORD 환경변수)
  --token <jwt>             로그인 대신 이 JWT 를 쓴다 (auth:stub 토큰 등, TEST_JWT 환경변수도 가능)

예시:
  TEST_EMAIL=dayeon-test@dweax.com TEST_PASSWORD=... \\
    node scripts/media-e2e.mjs ~/Desktop/IMG_5438.MOV`;

// ── .env 로드 (기존 환경변수를 덮지 않는다) ─────────────
async function loadEnv() {
  let raw;
  try {
    raw = await readFile(ENV_PATH, 'utf8');
  } catch {
    fail(`${ENV_PATH}를 읽을 수 없습니다.`, '저장소 루트에서 실행하세요.');
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // 인용부호 제거, 없으면 인라인 주석 제거
    if (/^["']/.test(v)) v = v.slice(1, v.lastIndexOf(v[0]));
    else v = v.replace(/\s+#.*$/, '').trim();
    env[m[1]] = v;
  }
  return env;
}

// ── API 호출 헬퍼 ───────────────────────────────────────
function makeApi(baseUrl, token) {
  return async function call(method, path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      fail(`${method} ${path} → ${res.status} (JSON 아님)`, text.slice(0, 300));
    }
    if (!res.ok) {
      const e = json.error ?? {};
      fail(`${method} ${path} → ${res.status} ${e.code ?? ''}`, e.message ?? text.slice(0, 300));
    }
    return json.data;
  };
}

async function login(env, opts) {
  // 이미 토큰이 있으면 로그인하지 않는다 — `npm run auth:stub` 토큰으로 Supabase 없이
  // 검증할 수 있다(프로젝트가 자동 일시정지된 동안에도).
  const token = opts.token ?? process.env.TEST_JWT;
  if (token) {
    ok('전달받은 토큰 사용 (로그인 건너뜀)');
    return token;
  }
  const email = opts.email ?? process.env.TEST_EMAIL;
  const password = opts.password ?? process.env.TEST_PASSWORD;
  if (!email || !password) {
    fail(
      '로그인 정보가 없습니다.',
      'TEST_EMAIL / TEST_PASSWORD 환경변수 또는 --email / --password 를 지정하세요.',
    );
  }
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) fail(`Supabase 로그인 실패 (${res.status})`, json.msg ?? JSON.stringify(json));
  ok(`로그인: ${email}`);
  return json.access_token;
}

/** ffprobe가 있으면 길이(초)를 구한다. 없으면 undefined. */
function probeDuration(path) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8' },
    );
    const n = Number.parseFloat(out.trim());
    return Number.isFinite(n) ? Math.round(n) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 촬영 시각. 앱은 스냅의 실제 촬영 시각을 보내지만 여기서는 파일에서 얻는다 —
 * ffprobe 의 creation_time 이 있으면 그 값, 없으면 파일 mtime.
 */
function probeCapturedAt(path) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format_tags=creation_time', '-of', 'csv=p=0', path],
      { encoding: 'utf8' },
    ).trim();
    const parsed = Date.parse(out);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  } catch {
    /* ffprobe 가 없거나 태그가 없으면 아래로 */
  }
  return statSync(path).mtime.toISOString();
}

/** 1클립: presigned 발급 → S3 PUT → 등록. videoId 반환. */
async function uploadClip(api, path) {
  const filename = basename(path);
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
  if (!contentType) {
    fail(`지원 목록에 없는 확장자: ${extname(path)}`, `지원: ${Object.keys(CONTENT_TYPES).join(', ')}`);
  }
  const size = statSync(path).size;
  info(`${filename} (${(size / 1024 / 1024).toFixed(1)}MB, ${contentType})`);

  const target = await api(
    'GET',
    `/videos/upload-url?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
  );
  dim(`videoId=${target.videoId}  s3Key=${target.s3Key}`);

  // S3 직접 PUT — Authorization 헤더를 붙이면 안 된다(쿼리 서명 방식)
  const put = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
    body: createReadStream(path),
    duplex: 'half',
  });
  if (!put.ok) {
    fail(`S3 업로드 실패 (${put.status})`, (await put.text()).slice(0, 400));
  }
  dim(`S3 PUT ${put.status}`);

  const durationSeconds = probeDuration(path);
  const capturedAt = probeCapturedAt(path);
  const video = await api('POST', '/videos', {
    videoId: target.videoId,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    capturedAt,
  });
  ok(
    `등록 완료 status=${video.status} duration=${video.durationSeconds ?? '-'}s ` +
      `capturedAt=${video.capturedAt ?? '(없음)'}`,
  );
  return video.id;
}

/** 편집 완료까지 폴링. 완료된 job 반환. */
async function pollJob(api, jobId) {
  const started = Date.now();
  let lastProgress = -1;
  for (;;) {
    const job = await api('GET', `/edit-jobs/${jobId}`);
    if (job.progress !== lastProgress || job.status !== 'processing') {
      info(`status=${job.status} progress=${job.progress}%`);
      lastProgress = job.progress;
    }
    if (job.status === 'done' || job.status === 'failed') return job;
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      fail(`${POLL_TIMEOUT_MS / 1000}초 내에 끝나지 않았습니다.`, `마지막 상태: ${job.status} ${job.progress}%`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ── main ────────────────────────────────────────────────
const opts = parseArgs(process.argv.slice(2));
if (opts.help || opts.files.length === 0) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}
if (opts.files.length > 10) fail('클립은 최대 10개입니다.');
for (const f of opts.files) {
  try {
    statSync(f);
  } catch {
    fail(`파일을 찾을 수 없습니다: ${f}`);
  }
}

const env = await loadEnv();
// API_BASE_URL로 대상 서버 오버라이드 가능 (예: compose 네트워크 안에서 http://api:3000)
const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${env.API_PORT ?? 3000}`;

step('0. 사전 확인');
const health = await fetch(`${baseUrl}/health`).catch(() => null);
if (!health?.ok) fail(`API 서버에 연결할 수 없습니다 (${baseUrl})`, 'npm run dev:api 로 먼저 띄우세요.');
ok(`API ${baseUrl} — ${JSON.stringify((await health.json()).data)}`);

step('1. 로그인');
const token = await login(env, opts);
const api = makeApi(baseUrl, token);
const me = await api('GET', '/auth/me');
ok(`유저 ${me.nickname ?? '(닉네임 없음)'} plan=${me.plan}`);

step(`2. 클립 업로드 (${opts.files.length}개)`);
const videoIds = [];
for (const f of opts.files) {
  videoIds.push(await uploadClip(api, resolve(f)));
}

if (opts.uploadOnly) {
  step('완료 (--upload-only)');
  console.log(`\nvideoIds: ${JSON.stringify(videoIds)}`);
  process.exit(0);
}

step(`3. 무비 만들기 (style=${opts.style}, captions=${opts.subtitles ?? false})`);
const movie = await api('POST', '/movies', {
  title: `e2e ${new Date().toISOString().slice(0, 16)}`,
  clips: videoIds.map((videoId) => ({ videoId })),
  stylePreset: opts.style,
  ...(opts.subtitles ? { captions: true } : {}),
});
ok(`movieId=${movie.id} status=${movie.status} clips=${movie.clips.length}`);

const { jobId } = await api('POST', `/movies/${movie.id}/export`, undefined);
ok(`jobId=${jobId}`);
dim(`실시간 진행률: npx wscat -c "ws://localhost:${env.API_PORT}/edit-jobs/${jobId}/progress?token=<jwt>"`);

step('4. 편집 진행 (워커가 떠 있어야 진행됩니다 — npm run worker)');
const job = await pollJob(api, jobId);
if (job.status === 'failed') {
  fail('편집 실패', job.errorMessage ?? '(errorMessage 없음)');
}

step('5. 결과물');
// 무비를 다시 읽어 결과물을 찾는다 — 서버가 생성 완료를 무비에 반영했는지까지 함께 본다.
const finished = await api('GET', `/movies/${movie.id}`);
if (finished.status !== 'ready' || !finished.resultVideoId) {
  fail('무비가 완성 상태가 아니다', `status=${finished.status} resultVideoId=${finished.resultVideoId}`);
}
const output = await api('GET', `/videos/${finished.resultVideoId}`);
ok(`status=${output.status}`);
console.log(`
  editedUrl:    ${output.editedUrl}
  thumbnailUrl: ${output.thumbnailUrl}
  stylePreset:  ${output.stylePreset}

  검증:
    curl -s -o ./test/edited.mp4 "${output.editedUrl}"
    ffprobe -hide_banner ./test/edited.mp4    # 1080x1920 h264 + aac (자막은 --subtitles 일 때만)

  끝내기까지 확인하려면 (결과물 파일이 지워진다, 되돌릴 수 없다):
    curl -sX POST "${baseUrl}/movies/${movie.id}/finish" -H "Authorization: Bearer <jwt>"
`);
