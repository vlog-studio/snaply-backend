-- 템플릿 슬롯에 어떤 스냅을 넣을지에 대한 서버의 제안.
-- docs/decisions/template-snap-recommendation.md
--
-- 새 큐를 만들지 않았다. 비싼 일(분석)은 이미 video-analysis 큐가 지고 있고, 추천은 그 결과를
-- 모아 점수를 매기는 오케스트레이션이라 두 번째 큐는 첫 번째 큐를 기다리기만 한다.
-- 접수 시점에 분석을 적재하고, 채점은 조회(폴링) 시점에 한다 — 결정 문서 §7.

CREATE TABLE "movie_recommendations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" VARCHAR(40) NOT NULL,

    -- 후보 스냅, 촬영 시간 오름차순. 이 순서가 점수화의 시간 사전값이라 집합이 아니라 배열이다.
    "candidate_video_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    -- (user, template, 후보 집합) 의 해시. 재사용 창 안의 같은 요청은 같은 추천을 받는다.
    "candidate_hash" VARCHAR(64) NOT NULL,

    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    -- [{ videoId, reason }] — 배정에서 빠진 후보와 이유.
    "excluded" JSONB NOT NULL DEFAULT '[]',

    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movie_recommendations_pkey" PRIMARY KEY ("id")
);

-- 멱등 조회: 같은 후보 집합의 최근 추천 찾기.
CREATE INDEX "movie_recommendations_user_template_hash_idx"
    ON "movie_recommendations"("user_id", "template_id", "candidate_hash", "created_at");
-- 일일 추천 횟수 집계.
CREATE INDEX "movie_recommendations_user_id_created_at_idx"
    ON "movie_recommendations"("user_id", "created_at");

CREATE TABLE "movie_recommendation_items" (
    "recommendation_id" UUID NOT NULL,
    "slot_id" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL,
    -- null 이면 채울 후보가 없었다는 뜻이고, 그 자리는 화면에서 '지금 찍기' 로 남는다.
    "video_id" UUID,
    "score" DOUBLE PRECISION,

    CONSTRAINT "movie_recommendation_items_pkey" PRIMARY KEY ("recommendation_id", "slot_id")
);

ALTER TABLE "movie_recommendations" ADD CONSTRAINT "movie_recommendations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 템플릿은 지우지 않고 retired_at 으로 내린다. 지우면 과거 추천이 가리킬 곳을 잃는다.
ALTER TABLE "movie_recommendations" ADD CONSTRAINT "movie_recommendations_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "movie_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "movie_recommendation_items" ADD CONSTRAINT "movie_recommendation_items_recommendation_id_fkey"
    FOREIGN KEY ("recommendation_id") REFERENCES "movie_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 영상이 삭제되면 그 자리만 비운다. 추천 전체를 지우지 않는다.
ALTER TABLE "movie_recommendation_items" ADD CONSTRAINT "movie_recommendation_items_video_id_fkey"
    FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
