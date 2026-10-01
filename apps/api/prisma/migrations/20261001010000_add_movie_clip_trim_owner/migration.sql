-- Who chose each cut's range (docs/specs/movie.md MOV-22).
--
-- Only the AI edit draft (MOV-21) trims cuts for the user; an 'ai' range may be
-- re-chosen by the system, a 'user' range never is. Every existing range was
-- set by the user — or is the whole snap the user picked — hence the 'user'
-- default, the opposite of transition_owner's 'ai'.

ALTER TABLE "movie_clips"
ADD COLUMN "trim_owner" "MovieArranger" NOT NULL DEFAULT 'user';
