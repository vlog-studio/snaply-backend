-- 스냅 내용 분석 결과 표.
-- docs/decisions/snap-content-analysis.md
--
-- videos.status 와 분리한 이유: 업로드는 성공했지만 분석은 대기·실패인 상태를 한 컬럼으로
-- 표현할 수 없다. 분석이 실패해도 원본 영상은 ready 를 유지한다.
--
-- (video_id, analysis_version) unique 가 두 가지를 동시에 받친다.
--   - 같은 스냅에 대한 중복 분석 적재 방지 (버전당 1행)
--   - 모델·프롬프트 교체 시 기존 결과를 덮지 않고 새 버전으로 비교

CREATE TABLE "video_analyses" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "analysis_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',

    -- 이 분석이 사용한 FFprobe 실측값의 스냅샷. 길이의 원천은 videos 쪽이다.
    "duration_ms" INTEGER,
    "frame_timestamps_ms" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    "summary" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "places" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "objects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "moods" TEXT[] DEFAULT ARRAY[]::TEXT[],

    "visual_quality_score" DOUBLE PRECISION,
    "visual_issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usable_for_edit" BOOLEAN,
    "confidence" DOUBLE PRECISION,

    "provider" VARCHAR(30) NOT NULL DEFAULT 'openai',
    -- 레코드는 워커가 모델을 고르기 전에 만들어지므로 완료 시점에 채워진다.
    "model_version" VARCHAR(100),
    "prompt_version" VARCHAR(30),

    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(40),
    "error_message" TEXT,

    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_analyses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "video_analyses_video_id_analysis_version_key"
    ON "video_analyses"("video_id", "analysis_version");
CREATE INDEX "video_analyses_user_id_status_idx" ON "video_analyses"("user_id", "status");
-- 대기·처리 중 작업을 훑는 재적재/관측 경로용.
CREATE INDEX "video_analyses_status_created_at_idx" ON "video_analyses"("status", "created_at");

-- 영상이 사라지면 분석 결과도 남길 이유가 없다.
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_video_id_fkey"
    FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
