-- 정기 구독을 제거하고 크레딧 결제로 전환한다.
-- docs/decisions/credit-payment-model.md · docs/decisions/payment-channel-iap.md
--
-- subscriptions 는 Stripe 구독 구현의 잔재다. 운영에 유료 구독 행이 없음을 확인했으므로
-- 이관 없이 drop 한다.

CREATE TYPE "Store" AS ENUM ('apple', 'google');

CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "store" "Store" NOT NULL,
    "product_id" VARCHAR(100) NOT NULL,
    "store_transaction_id" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'completed',
    "credits_granted" INTEGER NOT NULL,
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "purchased_at" TIMESTAMPTZ(6) NOT NULL,
    "refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchases_store_transaction_id_key" ON "purchases"("store_transaction_id");
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at");

CREATE TABLE "credit_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "purchase_id" UUID,
    "edit_job_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- 한 작업의 같은 사유는 한 번뿐 — 예약·환급의 멱등성이 이 제약에 걸려 있다.
CREATE UNIQUE INDEX "credit_ledger_edit_job_id_reason_key" ON "credit_ledger"("edit_job_id", "reason");
CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger"("user_id", "created_at");

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "subscriptions";
