-- 편집 실패의 분류 코드 (TIMEOUT / SOURCE_UNAVAILABLE / QUEUE_FAILED / INTERNAL).
-- 앱이 사용자 문구로 매핑하는 키이며, status='failed'일 때만 채워진다.
ALTER TABLE "edit_jobs" ADD COLUMN "error_code" VARCHAR(40);
