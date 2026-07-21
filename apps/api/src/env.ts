import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// apps/api/.env 로드 (src/와 dist/ 어디서 실행해도 한 단계 위가 패키지 루트)
const envPath = fileURLToPath(new URL('../.env', import.meta.url));

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
