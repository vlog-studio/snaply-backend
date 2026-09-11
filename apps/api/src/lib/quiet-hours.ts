/**
 * 사용자가 알림을 받지 않기로 한 시간대 판정.
 *
 * 두 곳이 쓴다(장소 추천·무비 완료). 한 곳에만 두고 복사하면 한쪽만 고쳐져도 아무도 모른다.
 *
 * **만료 예고는 이 판정을 쓰지 않는다.** 걸러서 안 보내면 사용자가 파일을 잃기 때문에,
 * 시간으로 거르는 대신 배치를 낮에 돌린다
 * (docs/decisions/expiry-notice-schedule.md).
 */

/** KST(UTC+9) 기준 현재 시각이 quiet hours 구간인지. 자정을 넘는 구간(22-8시)도 다룬다. */
export function isQuietNow(quietStart: number, quietEnd: number, now: Date): boolean {
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (quietStart === quietEnd) {
    return false;
  }
  if (quietStart < quietEnd) {
    return kstHour >= quietStart && kstHour < quietEnd;
  }
  return kstHour >= quietStart || kstHour < quietEnd;
}
