-- Per-kind notification switches.
--
-- The app has had separate toggles for location and movie alerts all along,
-- but they were stored on the device, so the server kept pushing what the user
-- had turned off. These columns are where those toggles actually live.
--
-- There is deliberately no switch for the snap expiry notice. That one says
-- footage is about to be deleted, and deletion has no grace period precisely
-- because we promised to warn first -- a user who silenced it would lose
-- recordings without being told. It follows the master switch only.

ALTER TABLE "users"
ADD COLUMN "location_notification_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "movie_notification_enabled" BOOLEAN NOT NULL DEFAULT true;
