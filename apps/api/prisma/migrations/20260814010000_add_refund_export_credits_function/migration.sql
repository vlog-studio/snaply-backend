-- export 예약 크레딧 환급의 **단일 정의**.
--
-- 환급을 실행하는 주체가 둘이다: 사용자 취소를 처리하는 API(TypeScript)와 실패를 확정하는
-- 워커(Python). 같은 INSERT 문을 두 언어에 복사해 두면 한쪽만 고쳐지는 순간 잔액이 어긋나므로,
-- 두 호출자가 공유할 수 있는 유일한 장소인 DB에 정의를 둔다. 양쪽은 이 함수를 호출만 한다.
--
-- 금액을 인자로 받지 않고 원장에서 계산한다 — 차감량 정책이 바뀌어도 그 작업에 **실제로
-- 차감된 만큼만** 되돌리기 위해서다.
--
-- 멱등하다: credit_ledger(edit_job_id, reason) unique 제약에 걸려 환급은 한 번만 기록된다.
-- 취소와 실패가 겹쳐 두 경로가 동시에 호출해도 결과가 하나로 수렴한다.
CREATE OR REPLACE FUNCTION refund_export_credits(p_edit_job_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO credit_ledger (id, user_id, delta, reason, edit_job_id, created_at)
  SELECT gen_random_uuid(), user_id, -SUM(delta), 'export_refund', p_edit_job_id, now()
  FROM credit_ledger
  WHERE edit_job_id = p_edit_job_id
  GROUP BY user_id
  -- 순차감이 없으면(이미 환급됐거나 예약이 없으면) 아무 행도 넣지 않는다.
  HAVING SUM(delta) < 0
  ON CONFLICT (edit_job_id, reason) DO NOTHING;
$$;
