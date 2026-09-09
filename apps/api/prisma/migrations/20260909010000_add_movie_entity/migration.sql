-- The movie (the meeting's "project"): an editing recipe that references snaps
-- rather than owning them, so one snap can be cut differently into two movies.
--
-- Until now a movie lived only in the app's local store, which meant it did not
-- survive a reinstall or a new device. The recipe also has to outlive the
-- rendered file: finishing a movie deletes the file, and the project stays so
-- the user can reopen, change, and run it again.

CREATE TYPE "MovieStatus" AS ENUM ('draft', 'generating', 'ready', 'failed');
CREATE TYPE "MovieArranger" AS ENUM ('user', 'ai');

CREATE TABLE "movies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "status" "MovieStatus" NOT NULL DEFAULT 'draft',
  "style_preset" VARCHAR(20) NOT NULL DEFAULT '일상',
  "captions" BOOLEAN NOT NULL DEFAULT false,
  "ratio" VARCHAR(10) NOT NULL DEFAULT '9:16',
  "arranger" "MovieArranger" NOT NULL DEFAULT 'user',
  -- One live result per movie: re-exporting replaces rather than accumulates.
  "result_video_id" UUID,
  -- Set when the user downloaded or posted the result; the file goes, this stays.
  "finished_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "movie_clips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "movie_id" UUID NOT NULL,
  "video_id" UUID NOT NULL,
  "order" INTEGER NOT NULL,
  "start_ms" INTEGER,
  "end_ms" INTEGER,
  CONSTRAINT "movie_clips_pkey" PRIMARY KEY ("id")
);

-- The studio board reads a user's movies most-recently-edited first.
CREATE INDEX "movies_user_id_updated_at_idx" ON "movies"("user_id", "updated_at");
-- Answers "which movies use this snap", which deleting a snap needs.
CREATE INDEX "movie_clips_video_id_idx" ON "movie_clips"("video_id");
-- Two cuts cannot claim the same position in one movie.
CREATE UNIQUE INDEX "movie_clips_movie_id_order_key" ON "movie_clips"("movie_id", "order");

ALTER TABLE "movies"
  ADD CONSTRAINT "movies_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Losing the rendered video empties the pointer; the movie itself survives.
  ADD CONSTRAINT "movies_result_video_id_fkey" FOREIGN KEY ("result_video_id")
    REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movie_clips"
  ADD CONSTRAINT "movie_clips_movie_id_fkey" FOREIGN KEY ("movie_id")
    REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "movie_clips_video_id_fkey" FOREIGN KEY ("video_id")
    REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
