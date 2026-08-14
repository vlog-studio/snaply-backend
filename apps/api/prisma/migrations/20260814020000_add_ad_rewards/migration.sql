-- 보상형 광고 크레딧 — 세션 표와 원장 연결.
-- docs/decisions/ad-reward-credits.md
--
-- 지급의 트리거는 AdMob SSV 콜백 하나뿐이다. ad_rewards 는 그 콜백이 어떤 사용자·어떤
-- 정책값으로 발급된 세션에 속하는지를 잇는 왕복 상태이며, 지급 멱등성은 두 제약이 받친다.
--   - transaction_id unique      : 같은 SSV 트랜잭션의 재전송
--   - credit_ledger(ad_reward_id, reason) unique : 한 세션당 ad_reward 원장 1행

CREATE TABLE "ad_rewards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "credits" INTEGER NOT NULL,
    "transaction_id" VARCHAR(64),
    "ad_unit" VARCHAR(64),
    "reject_reason" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "granted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_rewards_nonce_key" ON "ad_rewards"("nonce");
CREATE UNIQUE INDEX "ad_rewards_transaction_id_key" ON "ad_rewards"("transaction_id");
CREATE INDEX "ad_rewards_user_id_created_at_idx" ON "ad_rewards"("user_id", "created_at");
-- 일일 한도·쿨다운은 "지급된 시각" 으로 센다.
CREATE INDEX "ad_rewards_user_id_granted_at_idx" ON "ad_rewards"("user_id", "granted_at");

ALTER TABLE "ad_rewards" ADD CONSTRAINT "ad_rewards_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_ledger" ADD COLUMN "ad_reward_id" UUID;

-- edit_job_id 와 같은 장치 — 한 보상 세션은 ad_reward 행을 최대 하나만 만든다.
-- NULL 인 행(구매·프로모션·export)은 Postgres 가 NULL 을 서로 다르게 보므로 제약을 받지 않는다.
CREATE UNIQUE INDEX "credit_ledger_ad_reward_id_reason_key"
    ON "credit_ledger"("ad_reward_id", "reason");

ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_ad_reward_id_fkey"
    FOREIGN KEY ("ad_reward_id") REFERENCES "ad_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
