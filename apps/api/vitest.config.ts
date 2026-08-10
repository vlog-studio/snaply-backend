import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // 테스트 DB 생성 + 마이그레이션 (1회)
    globalSetup: ['./test/setup/global-setup.ts'],
    // 각 테스트 파일이 로드되기 전에 환경변수 고정 (.env를 읽지 않는 hermetic 구성)
    setupFiles: ['./test/setup/env.ts'],
    // 테스트 DB를 공유하므로 파일 간 병렬 실행은 끈다.
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
