-- Persist immutable edit/render settings so retries and later re-renders are reproducible.
ALTER TABLE "edit_jobs"
ADD COLUMN "pipeline_version" VARCHAR(20) NOT NULL DEFAULT '2',
ADD COLUMN "edit_spec" JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN "render_spec" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Preserve the style selected for jobs created before this migration.
UPDATE "edit_jobs" AS job
SET "edit_spec" = jsonb_build_object(
  'version', 1,
  'stylePreset', COALESCE(video."style_preset", '일상')
)
FROM "videos" AS video
WHERE video."id" = job."video_id";

-- Existing jobs used the former fixed 1920x1080 contain renderer.
UPDATE "edit_jobs"
SET "render_spec" = jsonb_build_object(
  'profileVersion', 1,
  'outputProfile', 'youtube_landscape',
  'width', 1920,
  'height', 1080,
  'fps', 30,
  'fitMode', 'contain'
);
