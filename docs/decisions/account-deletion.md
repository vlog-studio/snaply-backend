# 계정 삭제 정책

- 작성일: 2026-08-12
- 상태: **결정** (구현 완료 — [progress.md](../progress.md))
- 관련: [snap-source-of-truth.md](./snap-source-of-truth.md)(영상 soft delete + GC),
  [api-spec.md](../api-spec.md) §인증/프로필, [backlog.md](../backlog.md) C-5·E-3

## 결정

**soft delete + 30일 유예 + 배치 실삭제.** 유예 기간 값은 backlog A-4 의 미결 항목이었고
30일(업계 30~60일 중 하한, 제안값 그대로)로 확정한다.

### 삭제 요청 시점 (`DELETE /auth/me`)

즉시 수행:

| 대상 | 처리 | 이유 |
|---|---|---|
| Stripe 구독 | **즉시 취소** (`subscriptions.cancel`) | 삭제된 계정에 과금이 계속되면 안 된다. 취소 실패 시 계정 삭제 자체를 중단(재시도 가능) |
| SNS 연동 토큰 | 행 삭제 | 암호화돼 있어도 보유할 이유가 없다 |
| FCM 토큰 | null | 푸시 즉시 중단 |
| 진행 중 편집 작업 | `status='failed'` + 큐에서 제거(최선 노력) | `canceled` 상태 신설은 shared-types·워커·응답 스키마 전파가 커서 기각 |
| `users.deleted_at` | 기록 | 이후 모든 인증 요청은 `403 ACCOUNT_PENDING_DELETION` |

유예 기간 중 로그인하면 403 과 함께 복구 경로(`POST /auth/me/restore`)를 안내한다.
복구는 `deleted_at` 만 되돌린다 — 이미 정리된 토큰·연동·구독은 되살리지 않는다.

### 유예 만료 후 (배치 `npm run accounts:purge -w apps/api`)

계정별로 이 순서로 지운다:

1. **S3 prefix 삭제** — 키가 `uploads/{userId}/` 로 격리돼 있어 일괄 삭제 가능
2. **Supabase Auth 계정 삭제** (Admin API, `SUPABASE_SERVICE_ROLE_KEY` 필요) —
   DB 행만 지우면 유효 JWT 의 다음 요청에서 `resolveUser` 의 upsert 가 유저를 재생성하므로
   Auth 를 **먼저** 지워 재생성 창을 최소화한다
3. **`users` 행 삭제** — 전 자식 테이블이 `onDelete: Cascade` 라 한 번에 정리

개별 계정 실패는 Sentry 에 기록하고 다음 계정으로 넘어간다(다음 실행에서 재시도).
기본은 dry-run, `--yes` 로 실제 삭제. 운영에서는 하루 1회 스케줄 실행을 상정한다.

## 기각한 대안

- **즉시 하드 삭제**: 실수 삭제 복구 불가, S3 삭제 실패를 요청 경로에서 동기 처리해야 함,
  기존 영상 삭제 정책(유예 후 실삭제)과 불일치.
- **유예 중 Supabase Auth 즉시 삭제**: 복구가 불가능해진다. Auth 삭제는 실삭제 시점으로 미룬다.
- **`EditJobStatus` 에 `canceled` 신설**: shared-types·응답 스키마·워커까지 전파 범위가 넓다.
  계정이 이미 차단돼 사용자에게 보이지 않으므로 `failed` + 사유 메시지로 충분.

## 알려진 한계

- Supabase access token 은 발급 후 만료(기본 1시간)까지 유효하다. 실삭제 직후 그 토큰으로
  요청이 오면 빈 유저 행이 재생성될 수 있다 — 데이터는 이미 지워졌으므로 개인정보 문제는
  없고, 고아 행은 다음 purge 대상이 아니라 그냥 신규(빈) 유저로 남는다.
- 워커가 이미 잡은(active) 편집 작업은 큐에서 제거되지 않는다. 결과물은 유예 만료 시
  S3 prefix 삭제로 정리된다.
- SNS 에 이미 게시된 콘텐츠는 삭제 범위 밖이다(인스타 게시물은 API 삭제 불가 — backlog 참고).
- Stripe 웹훅이 실삭제 후 도착하면 `subscriptions` 행이 없어 조용히 무시된다(기존 동작).
- Meta 데이터 삭제 콜백(backlog C-5)은 이 파이프라인(`deleteAccount`)을 재사용해 구현한다.
