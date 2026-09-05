/**
 * OpenAPI 스냅샷(`apps/api/openapi.json`)을 코드에서 생성해 쓰거나(`openapi:write`),
 * 커밋된 파일과 같은지 검사한다(`openapi:check`). 서버·DB 없이 동작한다.
 *
 *   npm run openapi:write -w apps/api
 *   npm run openapi:check -w apps/api
 *
 * 같은 검사를 통합 테스트(`test/openapi-snapshot.test.ts`)도 하므로, 계약을 바꾼 뒤 스냅샷을
 * 갱신하지 않으면 CI 가 멈춘다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import {
  OPENAPI_SNAPSHOT_PATH,
  generateOpenApiDocument,
  serializeOpenApiDocument,
} from '../src/openapi.js';

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const generated = serializeOpenApiDocument(await generateOpenApiDocument(loadConfig()));

  if (!check) {
    writeFileSync(OPENAPI_SNAPSHOT_PATH, generated);
    console.log(`wrote ${OPENAPI_SNAPSHOT_PATH}`);
    return;
  }

  let committed: string;
  try {
    committed = readFileSync(OPENAPI_SNAPSHOT_PATH, 'utf8');
  } catch {
    console.error(`${OPENAPI_SNAPSHOT_PATH} 가 없습니다. npm run openapi:write -w apps/api`);
    process.exitCode = 1;
    return;
  }

  if (committed !== generated) {
    console.error(
      'openapi.json 이 코드에서 생성한 문서와 다릅니다. '
        + 'npm run openapi:write -w apps/api 를 실행하고 계약 변경과 같은 커밋에 넣으세요.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('openapi.json 은 최신입니다.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Redis·Prisma 는 지연 연결이라 열려 있지 않지만, 열렸다면 프로세스가 끝나지 않는다.
    process.exit();
  });
