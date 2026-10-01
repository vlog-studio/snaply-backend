-- Local signals of a snap for the AI edit draft (docs/specs/movie.md MOV-21).
--
-- Computed by the rendition worker from the original after upload — no model
-- call, so they exist regardless of analysis consent. One row per snap; a
-- change of method bumps signals_version and the row is rewritten. Rules that
-- read them: docs/decisions/edit-director.md

CREATE TABLE "video_signals" (
    "video_id" UUID NOT NULL,
    "signals_version" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "step_ms" INTEGER NOT NULL,
    "brightness" DOUBLE PRECISION NOT NULL,
    "sharpness" DOUBLE PRECISION NOT NULL,
    "frame_hashes" TEXT[],
    "motion" DOUBLE PRECISION[],
    "has_audio" BOOLEAN NOT NULL,
    "speech" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_signals_pkey" PRIMARY KEY ("video_id")
);

ALTER TABLE "video_signals" ADD CONSTRAINT "video_signals_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
