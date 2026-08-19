-- 무비 템플릿 카탈로그를 앱의 로컬 상수에서 서버로 옮긴다.
-- docs/decisions/template-snap-recommendation.md
--
-- 시드를 별도 스크립트가 아니라 이 마이그레이션에 두는 이유:
-- 카탈로그가 비어 있으면 앱은 내장 폴백으로 돌아가고, "서버가 카탈로그를 소유한다"가
-- 사실이 아니게 된다. compose 는 api 를 migrate 완료에 걸어두므로, 마이그레이션에 넣은
-- 행만이 모든 환경에서 반드시 존재한다. 문구·힌트 수정은 이후 마이그레이션의 UPDATE 로 한다
-- (사용자에게 보이는 문구가 리뷰 없이 바뀌지 않는다는 장점이 따라온다).

CREATE TABLE "movie_templates" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    -- POST /edit-jobs 가 받는 프리셋 이름 그대로. 앱이 영문 MovieStyle 로 변환한다.
    "style" VARCHAR(20) NOT NULL,
    -- 앱에서만 쓰는 트랙 키. 편집 파이프라인은 BGM 을 받지 않는다.
    "bgm" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    -- 내린 템플릿. 행을 지우면 그 템플릿으로 만든 과거 추천이 고아가 된다.
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movie_templates_pkey" PRIMARY KEY ("id")
);

-- 목록 조회는 항상 "내리지 않은 것을 정렬 순서대로" 다.
CREATE INDEX "movie_templates_retired_at_sort_order_idx"
    ON "movie_templates"("retired_at", "sort_order");

CREATE TABLE "movie_template_slots" (
    "template_id" VARCHAR(40) NOT NULL,
    "slot_id" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "hint" VARCHAR(80) NOT NULL,
    -- { places, objects, actions, topics, temporalPrior } — 추천 점수화 내부값이며
    -- API 응답에 나가지 않는다. jsonb 라 형태가 바뀌어도 마이그레이션이 필요 없다.
    "match_hints" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "movie_template_slots_pkey" PRIMARY KEY ("template_id", "slot_id")
);

-- 한 자리에 두 슬롯이 오면 화면의 장면 순서가 비결정적이 된다.
CREATE UNIQUE INDEX "movie_template_slots_template_id_position_key"
    ON "movie_template_slots"("template_id", "position");

ALTER TABLE "movie_template_slots" ADD CONSTRAINT "movie_template_slots_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "movie_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 시드 ────────────────────────────────────────────────────────────────
-- 앱이 지금 내장하고 있는 4개와 id·label·hint 가 같다. 같아야 서버 응답과 오프라인 폴백이
-- 같은 템플릿을 가리키고, 이번 변경이 사용자에게 보이는 화면을 바꾸지 않는다.

INSERT INTO "movie_templates" ("id", "name", "description", "style", "bgm", "sort_order") VALUES
    ('walk', '동네 산책', '걸으며 담은 여섯 장면',     '감성', 'lofi-walk',    0),
    ('day',  '하루 요약', '오늘 하루를 네 장면으로',    '일상', 'morning-tape', 1),
    ('cafe', '카페 한 곳', '다녀온 카페를 소개하는 다섯 장면', '감성', 'sunny-side', 2),
    ('trip', '나들이',    '멀리 다녀온 하루를 한 편으로', '여행', 'sunny-side',  3)
ON CONFLICT ("id") DO NOTHING;

-- match_hints 의 temporalPrior 는 외출 안에서의 정규화 위치(0=시작, 1=끝)다. 키워드가 하나도
-- 맞지 않아도 이 값이 현행 시간순 배치를 그대로 계승하므로, 추천이 지금보다 나빠지지 않는다.
-- places/objects/actions/topics 는 분석 결과의 같은 이름 필드와 부분 문자열로 대조한다.
-- 의미적 앵커가 없는 슬롯('한 컷')은 빈 배열이며, 화질·시간 위치로만 배정된다.
INSERT INTO "movie_template_slots" ("template_id", "slot_id", "position", "label", "hint", "match_hints") VALUES
    ('walk', 'start', 0, '출발',        '집 앞이나 지하철 출구', '{"places":["집","현관","지하철","역","입구"],"objects":["문","계단","출구"],"actions":["나서","출발"],"topics":["산책"],"temporalPrior":0.0}'),
    ('walk', 'alley', 1, '골목',        '좁은 길, 걷는 발',      '{"places":["골목","거리","길","주택가"],"objects":["담","벽","계단"],"actions":["걷"],"topics":["산책"],"temporalPrior":0.25}'),
    ('walk', 'shop',  2, '가게',        '간판이나 진열장',       '{"places":["가게","상점","시장","매장"],"objects":["간판","진열장","쇼윈도"],"actions":[],"topics":[],"temporalPrior":0.45}'),
    ('walk', 'hero',  3, '한 컷',       '오늘의 주인공',         '{"places":[],"objects":[],"actions":[],"topics":[],"temporalPrior":0.6}'),
    ('walk', 'view',  4, '풍경',        '멀리 보이는 것',        '{"places":["풍경","전망","공원","하늘","강"],"objects":["나무","건물","노을"],"actions":[],"topics":[],"temporalPrior":0.8}'),
    ('walk', 'back',  5, '돌아오는 길', '마무리',                '{"places":["길","골목","거리"],"objects":[],"actions":["걷","돌아"],"topics":[],"temporalPrior":1.0}'),

    ('day', 'morning', 0, '아침',   '하루를 여는 컷',   '{"places":["집","침실","주방","카페"],"objects":["커피","창","이불"],"actions":[],"topics":[],"temporalPrior":0.0}'),
    ('day', 'noon',    1, '낮',     '가장 오래 머문 곳', '{"places":["사무실","학교","카페","거리"],"objects":[],"actions":[],"topics":[],"temporalPrior":0.35}'),
    ('day', 'evening', 2, '저녁',   '해 질 무렵',       '{"places":["식당","거리","집"],"objects":["노을","조명"],"actions":[],"topics":[],"temporalPrior":0.75}'),
    ('day', 'closing', 3, '마무리', '하루를 닫는 컷',   '{"places":["집","침실"],"objects":["조명"],"actions":[],"topics":[],"temporalPrior":1.0}'),

    ('cafe', 'front', 0, '외관',    '가게 앞',            '{"places":["카페","가게","외관"],"objects":["간판","입구","문"],"actions":[],"topics":["카페"],"temporalPrior":0.0}'),
    ('cafe', 'menu',  1, '메뉴판',  '글씨가 보이게',      '{"places":["카페"],"objects":["메뉴판","메뉴","가격표","칠판"],"actions":[],"topics":["카페"],"temporalPrior":0.2}'),
    ('cafe', 'drink', 2, '음료',    '테이블 위 클로즈업', '{"places":["카페"],"objects":["커피","음료","잔","케이크","디저트"],"actions":["보여"],"topics":["카페","디저트"],"temporalPrior":0.5}'),
    ('cafe', 'room',  3, '공간',    '좌석과 조명',        '{"places":["카페","실내"],"objects":["좌석","의자","테이블","조명","창"],"actions":[],"topics":["카페"],"temporalPrior":0.7}'),
    ('cafe', 'sip',   4, '한 모금', '마시는 손',          '{"places":["카페"],"objects":["잔","컵","손"],"actions":["마시","들"],"topics":["카페"],"temporalPrior":1.0}'),

    ('trip', 'leave',  0, '떠나는 길',    '차 안, 역, 버스 창',   '{"places":["역","기차","버스","차","도로"],"objects":["창","좌석"],"actions":["타","이동"],"topics":["여행"],"temporalPrior":0.0}'),
    ('trip', 'arrive', 1, '도착',         '처음 본 장면',         '{"places":["역","입구","광장","거리"],"objects":["간판"],"actions":["도착"],"topics":["여행"],"temporalPrior":0.2}'),
    ('trip', 'main',   2, '오늘의 목적',  '보러 온 것',           '{"places":["관광지","바다","산","공원","전시"],"objects":[],"actions":["구경","보"],"topics":["여행","관광"],"temporalPrior":0.45}'),
    ('trip', 'food',   3, '먹은 것',      '한 그릇, 한 잔',       '{"places":["식당","카페"],"objects":["음식","그릇","커피","잔"],"actions":["먹"],"topics":["맛집"],"temporalPrior":0.65}'),
    ('trip', 'wide',   4, '넓게 한 번',   '어디였는지 알 수 있게', '{"places":["풍경","전망","바다","산"],"objects":["건물","하늘"],"actions":[],"topics":["여행"],"temporalPrior":0.85}'),
    ('trip', 'home',   5, '돌아오는 길',  '마무리',               '{"places":["역","차","도로"],"objects":["창"],"actions":["돌아"],"topics":["여행"],"temporalPrior":1.0}')
ON CONFLICT ("template_id", "slot_id") DO NOTHING;
