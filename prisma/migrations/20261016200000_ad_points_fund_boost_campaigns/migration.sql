-- Ad Points + Ad Fund balances; boost campaigns and their charged events (2026-10-16).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adFundBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "adPointsBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BoostCampaign" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidWith" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "budgetPoints" INTEGER NOT NULL,
    "spentPoints" INTEGER NOT NULL DEFAULT 0,
    "refundedPoints" INTEGER NOT NULL DEFAULT 0,
    "targeting" JSONB,
    "durationDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoostCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoostEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "viewerId" TEXT,
    "kind" TEXT NOT NULL,
    "country" TEXT,
    "costPoints" INTEGER NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoostCampaign_status_endsAt_idx" ON "BoostCampaign"("status", "endsAt");

-- CreateIndex
CREATE INDEX "BoostCampaign_postId_idx" ON "BoostCampaign"("postId");

-- CreateIndex
CREATE INDEX "BoostCampaign_userId_idx" ON "BoostCampaign"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BoostEvent_dedupeKey_key" ON "BoostEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "BoostEvent_campaignId_createdAt_idx" ON "BoostEvent"("campaignId", "createdAt");


-- AddForeignKey
ALTER TABLE "BoostCampaign" ADD CONSTRAINT "BoostCampaign_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostCampaign" ADD CONSTRAINT "BoostCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoostEvent" ADD CONSTRAINT "BoostEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BoostCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

