-- 계정 소프트 삭제: deleted_at 이 찍히면 30일 유예 후 purge 배치가 실삭제한다
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- purge 배치의 후보 스캔용
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
