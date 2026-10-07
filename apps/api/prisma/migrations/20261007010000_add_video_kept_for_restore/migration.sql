-- Deleted snaps stay restorable until their retention ends (docs/specs/snap-library.md SNAP-20).
--
-- Marks a user-deleted snap whose files were kept. Rows deleted before this
-- had their files removed on the spot, so they stay false and are never
-- offered for restore (docs/decisions/snap-trash.md).

ALTER TABLE "videos" ADD COLUMN "kept_for_restore" BOOLEAN NOT NULL DEFAULT false;
