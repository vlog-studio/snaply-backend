-- Store object keys separately so API responses can issue fresh presigned GET URLs.
ALTER TABLE "videos"
ADD COLUMN "original_s3_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "edited_s3_key" TEXT,
ADD COLUMN "thumbnail_s3_key" TEXT;

-- Source videos already have a canonical object key.
UPDATE "videos"
SET "original_s3_keys" = ARRAY["s3_key"]
WHERE "kind" = 'source' AND "s3_key" IS NOT NULL;

-- Recover keys for existing result videos from the previously stored public URLs.
UPDATE "videos"
SET "original_s3_keys" = COALESCE(
  (
    SELECT array_remove(
      array_agg(substring("url" FROM '(uploads/[^?#]+)')),
      NULL
    )
    FROM unnest("original_urls") AS "urls"("url")
  ),
  ARRAY[]::TEXT[]
)
WHERE "kind" = 'result';

UPDATE "videos"
SET "edited_s3_key" = substring("edited_url" FROM '(uploads/[^?#]+)')
WHERE "edited_url" IS NOT NULL;

UPDATE "videos"
SET "thumbnail_s3_key" = substring("thumbnail_url" FROM '(uploads/[^?#]+)')
WHERE "thumbnail_url" IS NOT NULL;
