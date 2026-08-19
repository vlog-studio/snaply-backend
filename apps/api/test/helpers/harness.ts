/**
 * 통합 테스트 하네스.
 *
 * 실제 로컬 인프라(Postgres/Redis/MinIO)를 그대로 쓰고, Supabase Auth만 스텁으로 대체한다.
 * 따라서 라우트·인증·DB 반영까지 운영과 동일한 경로로 검증된다.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { startAuthStub, type AuthStub } from '../../scripts/auth-stub.js';
import { clearExternalCredentials } from '../setup/hermetic.js';
import { TEST_DB_NAME } from '../setup/constants.js';
import { loadConfig } from '../../src/config.js';
import { buildApp } from '../../src/app.js';
import { getPrisma, disconnectPrisma } from '../../src/db/client.js';
import { closeEditQueue } from '../../src/queue/edit-queue.js';
import { closeVideoAnalysisQueue } from '../../src/queue/video-analysis-queue.js';
import { disconnectRedis } from '../../src/lib/redis.js';

export interface TestUser {
  /** users.id (앱 내부 UUID) */
  id: string;
  /** users.supabase_uid (JWT의 sub) */
  sub: string;
  email: string;
  token: string;
  /** 인증 헤더 — request({ headers: user.auth }) 형태로 사용 */
  auth: { authorization: string };
}

export interface Harness {
  app: FastifyInstance;
  prisma: PrismaClient;
  stub: AuthStub;
  /** 토큰 발급 + JIT 유저 생성까지 마친 테스트 유저 */
  createUser: (claims?: { sub?: string; email?: string }) => Promise<TestUser>;
  /** 모든 테이블 비우기 */
  resetDb: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * TRUNCATE 는 되돌릴 수 없으므로, 연결된 DB가 정말 테스트 DB인지 매번 확인한다.
 *
 * 실제로 한 번 사고가 났다: vitest 를 apps/api 밖에서 실행하면 `vitest.config.ts` 가
 * 로드되지 않아 setupFiles 가 건너뛰어지고, DATABASE_URL 이 개발 DB를 가리킨 채
 * TRUNCATE 가 돌아 개발 데이터(시드 위치 50개)가 통째로 날아갔다.
 */
export async function assertTestDatabase(client: {
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
}): Promise<void> {
  const rows = await client.$queryRawUnsafe<{ db: string }[]>('SELECT current_database() AS db');
  const current = rows[0]?.db;
  if (current !== TEST_DB_NAME) {
    throw new Error(
      `테스트가 테스트 DB가 아닌 '${current}' 에 연결됐습니다. TRUNCATE 를 중단합니다. `
        + `DATABASE_URL 이 '${TEST_DB_NAME}' 를 가리켜야 합니다. `
        + `vitest 는 반드시 apps/api 에서 실행하세요 (vitest.config.ts 의 setupFiles 적용 필요).`,
    );
  }
}

/** FK 역순 — TRUNCATE ... CASCADE 를 쓰므로 순서는 형식적이다. */
const TABLES = [
  'notification_logs',
  'sns_uploads',
  'sns_connections',
  'credit_ledger',
  'ad_rewards',
  'purchases',
  'edit_jobs',
  'video_analyses',
  'videos',
  'users',
  'locations',
];

/**
 * @param env 이 하네스에만 적용할 환경변수 오버라이드. close() 시 원복된다.
 *            예: 실제 RevenueCat 키로 검증하려면 { REVENUECAT_API_KEY: 'sk_...' }
 */
export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  // src/* 를 import 하는 과정에서 @prisma/client 가 dotenv 로 .env 를 다시 읽어
  // setupFiles 에서 지운 크리덴셜이 되살아난다. 설정을 읽기 직전에 한 번 더 정리한다.
  clearExternalCredentials();

  const stub = await startAuthStub();

  const saved: Record<string, string | undefined> = {};
  const applied: Record<string, string> = {
    SUPABASE_URL: stub.url,
    // 통합 테스트는 요청을 많이 보내므로 전역 IP 제한을 넉넉히. (제한 자체는 rate-limit.test.ts 에서 검증)
    RATE_LIMIT_GLOBAL_MAX: '10000',
    ...env,
  };
  for (const [key, value] of Object.entries(applied)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }

  const app = await buildApp(loadConfig());
  await app.ready();
  const prisma = getPrisma();

  async function resetDb(): Promise<void> {
    await assertTestDatabase(prisma);
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }

  async function createUser(claims: { sub?: string; email?: string } = {}): Promise<TestUser> {
    const sub = claims.sub ?? randomUUID();
    const email = claims.email ?? `test+${sub.slice(0, 8)}@snaply.local`;
    const token = await stub.mint({ sub, email });

    // /auth/me 를 한 번 호출해 JIT 유저 생성을 트리거 (운영과 동일 경로)
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.statusCode !== 200) {
      throw new Error(`테스트 유저 생성 실패: ${res.statusCode} ${res.body}`);
    }
    const id = res.json().data.id as string;
    return { id, sub, email, token, auth: { authorization: `Bearer ${token}` } };
  }

  function restoreEnv(): void {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  async function close(): Promise<void> {
    // env 원복은 반드시 수행해야 한다 — 테스트 파일들이 한 프로세스를 순차로 공유하므로,
    // 정리 중 예외로 원복이 건너뛰어지면 다음 파일이 엉뚱한 설정으로 돌아간다.
    try {
      await app.close();
      await closeEditQueue();
      await closeVideoAnalysisQueue();
      await disconnectRedis();
      await disconnectPrisma();
      await stub.close();
    } finally {
      restoreEnv();
    }
  }

  await resetDb();
  return { app, prisma, stub, createUser, resetDb, close };
}
