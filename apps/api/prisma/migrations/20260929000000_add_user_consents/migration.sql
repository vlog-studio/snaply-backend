-- A record of the consents a user gave (docs/decisions/snap-content-analysis.md §6.1, ANA-5).
--
-- One row is "this user agreed to this version of the wording at this time". Withdrawal fills
-- revoked_at instead of deleting the row, so what was agreed to, and when, stays provable.
-- A consent only counts for the version the app shows now: changing the wording bumps the
-- version, and the older rows stop counting without being touched.
--
-- Additive only. No existing user has consented, which is the intended default: analysis is
-- opt-in.

-- CreateTable
CREATE TABLE "user_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_consents_user_id_kind_idx" ON "user_consents"("user_id", "kind");

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
