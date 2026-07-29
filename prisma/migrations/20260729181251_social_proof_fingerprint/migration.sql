-- Social proof anti-fraud (feature #10): fingerprint log of submitted proof
-- values so repeated post/profile URLs, screenshot URLs, or usernames across
-- users can be flagged for admin review. (Task.order + its index are handled by
-- the earlier 20260729164834_task_order migration — intentionally not repeated.)

-- CreateTable
CREATE TABLE "SocialProofFingerprint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialProofFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialProofFingerprint_taskId_kind_valueHash_idx" ON "SocialProofFingerprint"("taskId", "kind", "valueHash");

-- CreateIndex
CREATE INDEX "SocialProofFingerprint_submissionId_idx" ON "SocialProofFingerprint"("submissionId");
