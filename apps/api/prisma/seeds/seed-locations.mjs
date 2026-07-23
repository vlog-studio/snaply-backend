// locations.sql을 DB에 적용하는 시드 러너 (단일 INSERT ... ON CONFLICT 문).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const sqlPath = fileURLToPath(new URL('./locations.sql', import.meta.url));
const sql = readFileSync(sqlPath, 'utf-8');

const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(sql);
  const count = await prisma.location.count();
  console.log(`위치 시드 적용 완료. locations 총 ${count}개`);
} finally {
  await prisma.$disconnect();
}
