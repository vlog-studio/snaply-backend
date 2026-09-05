import { fileURLToPath } from 'node:url';
import type { AppConfig } from './config.js';
import { buildApp } from './app.js';

export type OpenApiDocument = Record<string, unknown>;

/**
 * 커밋되는 OpenAPI 스냅샷의 위치. 저장소에서 스펙 파일은 이것 하나다 — 앱의 타입 생성과
 * 스냅샷 테스트가 같은 파일을 읽는다.
 */
export const OPENAPI_SNAPSHOT_PATH = fileURLToPath(new URL('../openapi.json', import.meta.url));

/**
 * 서버를 띄우지 않고 OpenAPI 문서를 만든다.
 *
 * 문서는 shared-types 의 Zod 계약에서 생성되므로 이 결과가 곧 와이어 계약이다. 개발 로그인
 * 스킴은 `NODE_ENV` 에 따라 달라지므로 스냅샷에서 뺀다 — 앱이 소비하는 계약이 아니다.
 */
export async function generateOpenApiDocument(config: AppConfig): Promise<OpenApiDocument> {
  const app = await buildApp(config, { docs: { enabled: true, allowDevLogin: false } });
  try {
    await app.ready();
    return app.swagger() as OpenApiDocument;
  } finally {
    await app.close();
  }
}

/** 스냅샷 파일의 직렬화 형식. 리뷰에서 diff 를 읽을 수 있게 들여쓴다. */
export function serializeOpenApiDocument(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
