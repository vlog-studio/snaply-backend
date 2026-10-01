-- Proposals of the AI edit draft (docs/specs/movie.md MOV-21).
--
-- Not movies: the app builds the movie from a proposal. Rows exist for the
-- rolling 24-hour cap and for returning the same proposal to the same request
-- (docs/decisions/auto-edit-draft.md §5).

CREATE TABLE "movie_drafts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "style_preset" VARCHAR(20) NOT NULL,
    "snap_hash" VARCHAR(64) NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movie_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movie_drafts_user_id_snap_hash_created_at_idx" ON "movie_drafts"("user_id", "snap_hash", "created_at");

CREATE INDEX "movie_drafts_user_id_created_at_idx" ON "movie_drafts"("user_id", "created_at");

ALTER TABLE "movie_drafts" ADD CONSTRAINT "movie_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
