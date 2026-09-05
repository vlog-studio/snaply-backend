/**
 * 커밋된 OpenAPI 스냅샷(`apps/api/openapi.json`)이 코드에서 생성한 문서와 같은지 검사한다.
 *
 * 스냅샷은 앱의 타입 생성이 읽는 파일이자 리뷰에서 계약 변경을 읽는 diff 다. 계약(shared-types)
 * 이나 라우트 문서를 바꾸고 스냅샷을 갱신하지 않으면 여기서 멈춘다 —
 * `npm run openapi:write -w apps/api`.
 */
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { disconnectPrisma } from '../src/db/client.js';
import { disconnectRedis } from '../src/lib/redis.js';
import {
  OPENAPI_SNAPSHOT_PATH,
  generateOpenApiDocument,
  serializeOpenApiDocument,
} from '../src/openapi.js';
import { closeEditQueue } from '../src/queue/edit-queue.js';
import { closeVideoAnalysisQueue } from '../src/queue/video-analysis-queue.js';

describe('OpenAPI 스냅샷', () => {
  afterAll(async () => {
    await closeEditQueue();
    await closeVideoAnalysisQueue();
    await disconnectRedis();
    await disconnectPrisma();
  });

  it('apps/api/openapi.json 은 계약에서 생성한 문서와 같다', async () => {
    const generated = await generateOpenApiDocument(loadConfig());
    const committed = JSON.parse(readFileSync(OPENAPI_SNAPSHOT_PATH, 'utf8')) as unknown;

    expect(generated, '계약이 바뀌었으면 `npm run openapi:write -w apps/api` 로 스냅샷을 갱신한다').toEqual(
      committed,
    );
  });

  it('스냅샷은 정해진 직렬화 형식(2칸 들여쓰기 + 끝 개행)으로 저장돼 있다', () => {
    const raw = readFileSync(OPENAPI_SNAPSHOT_PATH, 'utf8');
    expect(raw).toBe(serializeOpenApiDocument(JSON.parse(raw) as Record<string, unknown>));
  });
});
