-- Why a video went away, and when its bytes actually went.
--
-- An expired snap stays as a tombstone row so the user can still see what they
-- lost (the movie that referenced it must still open), and "you deleted this"
-- reads differently from "we deleted this because time ran out", so the reason
-- is stored rather than inferred.
--
-- purged_at records what happened, not what is scheduled: expiry itself is
-- derived from the upload time and the current policy, so changing the policy
-- never needs a backfill.

CREATE TYPE "VideoRemovalReason" AS ENUM ('user', 'expired');

ALTER TABLE "videos"
ADD COLUMN "removal_reason" "VideoRemovalReason",
ADD COLUMN "purged_at" TIMESTAMPTZ(6);

-- Rows deleted before this column existed were all user deletions.
UPDATE "videos" SET "removal_reason" = 'user' WHERE "deleted_at" IS NOT NULL;
