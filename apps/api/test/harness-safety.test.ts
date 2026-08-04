/**
 * 하네스 안전장치 회귀 테스트.
 *
 * 배경: vitest 를 apps/api 밖에서 실행하면 vitest.config.ts 가 로드되지 않아 setupFiles 가
 * 건너뛰어지고, DATABASE_URL 이 개발 DB를 가리킨 채 resetDb() 의 TRUNCATE 가 돌 수 있다.
 * 실제로 이 경로로 개발 DB의 시드 데이터가 날아갔다. 다시는 그러지 않도록 가드를 고정한다.
 *
 * 검증 대상은 `SELECT current_database()` 비교 로직이라, 앱 전체를 띄우지 않는다.
 * 안전을 위해 "앱 테이블이 없는" postgres 유지관리 DB로 붙인다 —
 * 혹시 가드가 없더라도 TRUNCATE 대상 테이블이 없어 아무것도 지워지지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { assertTestDatabase } from './helpers/harness.js';
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL, TEST_DB_NAME } from './setup/constants.js';

describe('assertTestDatabase', () => {
  it('테스트 DB에 연결돼 있으면 통과한다', async () => {
    const client = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    try {
      await expect(assertTestDatabase(client)).resolves.toBeUndefined();
    } finally {
      await client.$disconnect();
    }
  });

  it('테스트 DB가 아니면 TRUNCATE 전에 막는다', async () => {
    // postgres 유지관리 DB — 앱 테이블이 없다
    const client = new PrismaClient({ datasourceUrl: ADMIN_DATABASE_URL });
    try {
      await expect(assertTestDatabase(client)).rejects.toThrow(
        new RegExp(`테스트 DB가 아닌 'postgres'`),
      );
      await expect(assertTestDatabase(client)).rejects.toThrow(new RegExp(TEST_DB_NAME));
    } finally {
      await client.$disconnect();
    }
  });
});
