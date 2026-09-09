import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_PATH = path.join(apiDir, 'prisma', 'schema.prisma');

/**
 * `prisma generate` 는 생성물 옆에 그때 사용한 스키마 사본을 남긴다. 정렬만 다시 맞춘
 * 사본이라 원본과 바이트로는 다르고, 공백을 정규화하면 같아진다.
 */
function normalize(source: string): string {
  return source.replace(/\s+/g, ' ').trim();
}

function generatedSchemaPath(): string | null {
  const require = createRequire(import.meta.url);
  try {
    // @prisma/client 는 .prisma/client 로 재수출한다. 실제 생성물 디렉터리를 그쪽에서 찾는다.
    const entry = require.resolve('.prisma/client', { paths: [apiDir] });
    return path.join(path.dirname(entry), 'schema.prisma');
  } catch {
    return null;
  }
}

/**
 * 생성된 Prisma 클라이언트가 현재 schema.prisma 로 만들어진 것인지 확인한다.
 *
 * 스키마 변경을 pull 한 뒤 `npm run db:generate` 를 빼먹으면 낡은 클라이언트가 새 모델을
 * 몰라 테스트가 무더기로 실패하는데, 증상(`Cannot read properties of undefined`)만으로는
 * 원인이 드러나지 않아 매번 진단에 시간이 든다. 여기서 먼저 멈추고 해결 방법을 알려준다.
 */
export function assertPrismaClientFresh(): void {
  const generated = generatedSchemaPath();
  const hint =
    'Prisma 클라이언트가 현재 schema.prisma 와 맞지 않습니다.\n' +
    '  → `npm run db:generate` 를 실행한 뒤 다시 시도하세요.';

  if (generated === null) {
    throw new Error(`${hint}\n  (생성된 클라이언트를 찾지 못했습니다.)`);
  }

  let generatedSchema: string;
  try {
    generatedSchema = readFileSync(generated, 'utf8');
  } catch {
    throw new Error(`${hint}\n  (생성물에 스키마 사본이 없습니다: ${generated})`);
  }

  if (normalize(generatedSchema) !== normalize(readFileSync(SCHEMA_PATH, 'utf8'))) {
    throw new Error(hint);
  }
}
