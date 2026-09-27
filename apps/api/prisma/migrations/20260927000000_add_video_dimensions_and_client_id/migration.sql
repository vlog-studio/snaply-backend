-- What another device needs to draw a snap from the server list alone
-- (docs/plans/snap-reconcile.md).
--
-- width/height are display dimensions measured by the rendition worker on the
-- playable copy, so a portrait iPhone clip reads as portrait. client_id is the
-- app's own name for the snap, so the device that shot it can recognise its row;
-- it is not unique, because devices name snaps the same way.
--
-- Additive only. Existing rows stay null: nothing measures old renditions again,
-- and the client's name was never sent before.

ALTER TABLE "videos"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER,
ADD COLUMN "client_id" VARCHAR(128);
