/** 통합 테스트가 사용하는 로컬 인프라 좌표. docker-compose.dev.yml 과 일치해야 한다. */

export const PG_BASE_URL = process.env.TEST_PG_BASE_URL ?? 'postgresql://postgres:postgres@localhost:5432';
export const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'snaply_test';
export const TEST_DATABASE_URL = `${PG_BASE_URL}/${TEST_DB_NAME}`;
/** CREATE DATABASE 를 실행하기 위한 관리 접속 (기본 postgres DB). */
export const ADMIN_DATABASE_URL = `${PG_BASE_URL}/postgres`;

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
export const TEST_S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9100';
