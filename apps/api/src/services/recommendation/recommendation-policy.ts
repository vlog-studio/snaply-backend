/**
 * 추천의 정책 값. 값의 근거와 기각한 대안은
 * docs/decisions/template-snap-recommendation.md §4.
 *
 * 전부 **서버가 집행한다.** 앱이 집행하면 비용 정책이 앱 릴리스에 묶인다.
 * A-3 의 품질·단가 실측이 나오면 여기 숫자만 바꾼다.
 */

/** 추천 1회가 분석할 수 있는 후보 수. 슬롯 최대 6개의 2배. */
export const MAX_CANDIDATES = 12;

/**
 * 사용자 1명이 최근 24시간에 새로 만들 수 있는 추천 수.
 *
 * 달력 하루가 아니라 **직전 24시간**이다. 자정 경계에 한도가 리셋되면 시간대에 따라 사용자가
 * 받는 양이 달라지고, 서버 시간대를 사용자 시간대라고 가정하게 된다.
 * 재사용 창 안의 반복 요청은 새 추천을 만들지 않으므로 이 한도에 닿지 않는다.
 */
export const DAILY_RECOMMENDATION_LIMIT = 20;

/** 같은 (유저·템플릿·후보 집합) 요청이 기존 추천을 그대로 받는 기간. */
export const REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 접수 후 이 시간이 지나면 아직 안 끝난 분석을 포기하고 남은 것으로 채점한다.
 *
 * 없으면 분석 워커가 죽었을 때 추천이 영원히 `processing` 에 머문다. 앱은 로컬 매칭으로
 * 이미 화면을 채워 뒀으므로, 부분 결과가 무기한 대기보다 낫다.
 */
export const SCORING_DEADLINE_MS = 3 * 60 * 1000;

/**
 * 추천 경로가 켜져 있는가.
 *
 * **기본은 꺼짐이다.** 이 경로는 생산 스냅의 프레임을 외부 모델 제공자에게 보내는 분석을
 * 호출하므로, 약관 개정·제3자 제공 고지가 끝나기 전에는 켜지 않는다
 * (docs/decisions/snap-content-analysis.md §6). 꺼져 있으면 앱은 로컬 매칭만으로 동작한다.
 *
 * 호출 시점에 읽는다 — 기동 시점에 고정하면 끄고 켜는 데 재배포가 필요해진다.
 */
export function isRecommendationEnabled(): boolean {
  return process.env.MOVIE_RECOMMENDATION_ENABLED === 'true';
}
