-- Referral commission carry (2026-09-29).
--
-- Commissions were Math.floor(points * rate / 100): with L1 = 3% a 30-pt task
-- paid 0, so no commission was ever paid. The fraction now accrues per
-- referrer in thousandths of a point and whole points are paid at >= 1000.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCommissionCarryMilli" INTEGER NOT NULL DEFAULT 0;

-- One row per commission event (submission x level). The unique key makes the
-- carry idempotent even when the event paid no whole point.
CREATE TABLE IF NOT EXISTS "ReferralCommissionAccrual" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "milli" INTEGER NOT NULL,
    "paidPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCommissionAccrual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommissionAccrual_userId_reference_key"
  ON "ReferralCommissionAccrual"("userId", "reference");
