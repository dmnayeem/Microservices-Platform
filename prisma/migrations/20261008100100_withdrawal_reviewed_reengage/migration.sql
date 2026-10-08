-- Withdrawal tracker: when the manual review passed. Re-engagement: last reminder sent.
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastReengageAt" TIMESTAMP(3);
