-- 템플릿 설명을 앱 용어(컷)로 맞춘다. 앱 내장 카탈로그(movie-template-catalog.ts)와 같은 문구여야
-- 서버 응답과 오프라인 폴백이 같은 화면을 그린다. 운영자가 이미 고친 설명은 건드리지 않도록
-- 시드 원문과 같을 때만 바꾼다. updated_at 을 올려야 앱 캐시가 새 문구를 받는다.

UPDATE "movie_templates" SET "description" = '걸으며 찍은 6컷', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'walk' AND "description" = '걸으며 담은 여섯 장면';
UPDATE "movie_templates" SET "description" = '오늘 하루를 4컷으로', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'day' AND "description" = '오늘 하루를 네 장면으로';
UPDATE "movie_templates" SET "description" = '다녀온 카페를 소개하는 5컷', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'cafe' AND "description" = '다녀온 카페를 소개하는 다섯 장면';
