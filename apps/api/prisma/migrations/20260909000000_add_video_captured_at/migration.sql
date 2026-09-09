-- Record when a snap was filmed, so ordering and grouping can use the capture
-- time rather than the upload time. Nullable on purpose: the server cannot
-- recover this for rows uploaded before clients started sending it, and those
-- rows fall back to "created_at" instead of being backfilled with a wrong value.
ALTER TABLE "videos"
ADD COLUMN "captured_at" TIMESTAMPTZ(6);
