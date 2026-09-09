/**
 * 보관 정책의 상수 원천 — 무엇을 얼마나 들고 있다가 언제 지우는가.
 *
 * **스케줄은 유도하고, 사실은 저장한다.** 만료 시각을 행에 굳히지 않는 것이 이 모듈이 있는
 * 이유다. 업로드 시점에 `expiresAt = uploadedAt + 15일` 을 계산해 저장하면 정책이 바뀔 때마다
 * 전 행을 백필해야 하고, 요금제가 사용자마다 다른 기간을 팔기 시작하면 그마저도 표현되지
 * 않는다. 그래서 행에는 **사실**(업로드 시각·생성 시각)만 두고 만료 여부는 조회·배치 시점에
 * 아래 값으로 **유도**한다 — 정책 변경이 즉시 반영되고 백필이 없다.
 * (docs/plans/lifecycle-alignment.md §6-2)
 *
 * 확정된 것과 아직 아닌 것:
 * - 스냅 서버 보관 **15일** — 확정 (docs/decisions/snap-retention-period.md, SNAP-9)
 * - 끝내지 않은 무비 결과물 **30일** — 확정 (specs/movie.md MOV-16)
 * - **구독자에게 더 긴 기간을 줄지는 미확정**이다. 정해지기 전까지 전원 같은 값을 쓴다
 *   (docs/backlog.md A-2). 정해지면 `snapRetentionDaysFor(user)` 같은 함수가 이 상수를
 *   대신하게 되며, 유도 방식이라 그때 스키마는 건드리지 않는다.
 */

/** 스냅 원본의 서버 보관 기간(일). 기준 시각은 촬영이 아니라 **업로드**다. */
export const SNAP_RETENTION_DAYS = 15;

/**
 * 끝내지 않은 무비 결과물의 보관 상한(일).
 *
 * 끝내기(MOV-17)는 사용자 행동이라 하지 않을 수도 있다. 이 값은 그때 파일이 무한히 남지
 * 않게 하는 안전망이며, 끝내면 이보다 먼저 사라진다.
 */
export const MOVIE_RESULT_RETENTION_DAYS = 30;

/**
 * 만료 확정과 실삭제 사이의 간격(일).
 *
 * 삭제는 두 단계다 — ① 만료(사용자에게 "만료됨"으로 보이고 사용 불가, 파일은 아직 있음)
 * → ② 실삭제(복구 불가). **지금은 0** 이라 두 단계가 같은 시점에 일어난다.
 *
 * 요금제에 복구 기능이 들어가면 **이 값만 늘리면 된다** — 스냅 원본은 사용자가 찍은 영상이라
 * 재생성이 불가능해서, 파일을 실제로 지운 뒤에는 어떤 요금제로도 복구할 수 없다. 그래서
 * 구조를 미리 두 단계로 두었다 (docs/plans/lifecycle-alignment.md §6-1).
 */
export const EXPIRY_TO_PURGE_DAYS = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` 일 전 시각. 그보다 오래된 행이 만료 대상이다. */
export function cutoffFor(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
