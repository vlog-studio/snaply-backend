-- Location and movie alerts start off (docs/specs/notifications.md NTF-7).
--
-- The app turns them on from its switch, which asks the device for the
-- permission first. Existing rows go back to off too: the app had never written
-- these columns (backlog B-6), so a stored `true` was the old default, not a
-- choice. The app uploads the choices it kept on the device on its next start
-- (docs/decisions/notification-preferences.md "서버가 원천, 기본은 꺼짐").

ALTER TABLE "users"
ALTER COLUMN "location_notification_enabled" SET DEFAULT false,
ALTER COLUMN "movie_notification_enabled" SET DEFAULT false;

UPDATE "users" SET "location_notification_enabled" = false, "movie_notification_enabled" = false;
