-- Notification logs stop being geofence-only.
--
-- Expiry notices need the same table for the same reason geofence does: the row
-- is claimed before sending so a rerun cannot notify twice. But the two kinds
-- judge duplication differently -- geofence asks "in the last 30 minutes?",
-- expiry asks "did we already send this video's D-3?" -- so the kind is stored
-- rather than inferred from which foreign key is set.
--
-- location_id becomes nullable because an expiry notice has no location. The
-- unique constraint holds the expiry side: Postgres treats NULLs as distinct,
-- so geofence rows (video_id NULL) never collide with each other under it.

CREATE TYPE "NotificationKind" AS ENUM ('geofence', 'snap_expiry');

ALTER TABLE "notification_logs"
ADD COLUMN "kind" "NotificationKind" NOT NULL DEFAULT 'geofence',
ADD COLUMN "video_id" UUID,
ADD COLUMN "notice_days_before" INTEGER,
ALTER COLUMN "location_id" DROP NOT NULL;

ALTER TABLE "notification_logs"
ADD CONSTRAINT "notification_logs_video_id_fkey"
FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notification_logs_user_id_video_id_notice_days_before_key"
ON "notification_logs"("user_id", "video_id", "notice_days_before");
