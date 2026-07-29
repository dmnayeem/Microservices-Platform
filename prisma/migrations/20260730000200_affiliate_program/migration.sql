-- Affiliate program: opt-in flag, seller/tutor-set per-product reward on
-- listings + courses, click + commission ledgers, and a new transaction type.

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'AFFILIATE_COMMISSION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affiliateJoinedAt" TIMESTAMP(3);

ALTER TABLE "MarketplaceListing" ADD COLUMN     "affiliateCommissionType" TEXT,
ADD COLUMN     "affiliateCommissionValue" DECIMAL(18,6);

ALTER TABLE "Course" ADD COLUMN     "affiliateCommissionType" TEXT,
ADD COLUMN     "affiliateCommissionValue" DECIMAL(18,6);

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "affiliateUserId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateUserId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "saleAmount" DECIMAL(18,6) NOT NULL,
    "commissionAmount" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateClick_affiliateUserId_createdAt_idx" ON "AffiliateClick"("affiliateUserId", "createdAt");
CREATE INDEX "AffiliateClick_targetType_targetId_idx" ON "AffiliateClick"("targetType", "targetId");
CREATE UNIQUE INDEX "AffiliateCommission_sourceType_orderRef_key" ON "AffiliateCommission"("sourceType", "orderRef");
CREATE INDEX "AffiliateCommission_affiliateUserId_createdAt_idx" ON "AffiliateCommission"("affiliateUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateUserId_fkey" FOREIGN KEY ("affiliateUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
