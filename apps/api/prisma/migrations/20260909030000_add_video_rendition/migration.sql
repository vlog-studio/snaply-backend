-- A playable copy of every snap.
--
-- The original is whatever the phone recorded — an iPhone writes HEVC, often
-- HDR — which other platforms may refuse to play. Editing keeps using the
-- original, so this is an extra object rather than a replacement, and the app
-- can only stop keeping its local copy once this exists.
--
-- duration_ms is what FFprobe measured, which beats the length the client
-- reported; the client's value stays in duration_seconds.

ALTER TABLE "videos"
ADD COLUMN "rendition_s3_key" TEXT,
ADD COLUMN "rendition_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
ADD COLUMN "duration_ms" INTEGER;

-- Snaps uploaded before this feature have no rendition and no worker will make
-- one for them retroactively; marking them skipped keeps them out of the queue
-- and out of the "still pending" backlog.
UPDATE "videos" SET "rendition_status" = 'skipped'
WHERE "kind" = 'source' AND "status" != 'pending';
UPDATE "videos" SET "rendition_status" = 'skipped' WHERE "kind" = 'result';

CREATE INDEX "videos_rendition_status_idx" ON "videos"("rendition_status");
