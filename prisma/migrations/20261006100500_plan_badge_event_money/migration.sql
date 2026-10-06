-- Off-platform plan requests carry a payment screenshot.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT;

-- UPLOAD_PROOF events are reviewed by an admin before paying.
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "proofStatus" TEXT;
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "proofReviewedAt" TIMESTAMP(3);
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "proofReviewedById" TEXT;
ALTER TABLE "UserEventProgress" ADD COLUMN IF NOT EXISTS "proofNote" TEXT;
CREATE INDEX IF NOT EXISTS "UserEventProgress_proofStatus_idx" ON "UserEventProgress"("proofStatus");
