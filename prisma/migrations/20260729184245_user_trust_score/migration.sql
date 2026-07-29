-- Anti-fraud reputation columns (Phase B). Approvals raise trustScore, fraud
-- rejections lower it + count a strike; low trust forces manual review.
-- (Task.order and SocialProofFingerprint are handled by their own earlier
-- migrations — intentionally not repeated here.)

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fraudStrikes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 50;
