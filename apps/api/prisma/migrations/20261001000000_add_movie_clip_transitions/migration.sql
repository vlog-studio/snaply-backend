-- Per-boundary transitions (docs/specs/movie.md MOV-22).
--
-- A cut holds the transition from itself into the next cut; the last cut holds
-- none. transition_owner says who chose it: 'ai' boundaries are re-picked when
-- the cuts or the style change, 'user' ones stay while the two cuts stay
-- adjacent. Kinds and duration ranges live in
-- packages/shared-types/src/transition-vocabulary.json, so the kind is a plain
-- varchar rather than an enum — a new kind must not need a migration.

ALTER TABLE "movie_clips"
ADD COLUMN "transition_kind" VARCHAR(20),
ADD COLUMN "transition_ms" INTEGER,
ADD COLUMN "transition_owner" "MovieArranger" NOT NULL DEFAULT 'ai';

-- Backfill what each existing movie already renders: the style preset decided
-- the transition for every boundary ('감성' crossfades for 0.8s, the others cut).
-- Every boundary of an existing movie was the system's choice, hence 'ai'.
UPDATE "movie_clips" AS clip
SET
  "transition_kind" = CASE WHEN movie."style_preset" = '감성' THEN 'crossfade' ELSE 'hardcut' END,
  "transition_ms" = CASE WHEN movie."style_preset" = '감성' THEN 800 ELSE NULL END
FROM "movies" AS movie
WHERE movie."id" = clip."movie_id"
  AND clip."order" < (
    SELECT MAX(last."order") FROM "movie_clips" AS last WHERE last."movie_id" = clip."movie_id"
  );
