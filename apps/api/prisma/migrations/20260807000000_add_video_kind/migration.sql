-- CreateEnum
CREATE TYPE "VideoKind" AS ENUM ('source', 'result');

-- AlterTable
ALTER TABLE "videos"
ADD COLUMN "kind" "VideoKind" NOT NULL DEFAULT 'source';

-- Backfill edit outputs created before the kind column existed.
UPDATE "videos"
SET "kind" = 'result'
WHERE "id" IN (SELECT "video_id" FROM "edit_jobs");

-- CreateIndex
CREATE INDEX "videos_user_id_kind_created_at_idx"
ON "videos"("user_id", "kind", "created_at");
