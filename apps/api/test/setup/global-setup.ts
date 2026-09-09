import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertPrismaClientFresh } from './assert-prisma-client-fresh.js';
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL, TEST_DB_NAME } from './constants.js';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * 개발 DB(snaply)와 분리된 전용 테스트 DB를 만들고 마이그레이션을 적용한다.
 * 테스트가 개발 데이터를 건드리지 않도록 하기 위함.
 */
export default async function globalSetup(): Promise<void> {
  // DB 를 건드리기 전에 확인한다 — 낡은 클라이언트는 여기서 멈추는 편이 진단이 빠르다.
  assertPrismaClientFresh();

  const admin = new PrismaClient({ datasourceUrl: ADMIN_DATABASE_URL });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
    console.log(`[test] 테스트 DB 생성: ${TEST_DB_NAME}`);
  } catch {
    // 이미 존재하면 그대로 재사용
  } finally {
    await admin.$disconnect();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: apiDir,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
  });
}
