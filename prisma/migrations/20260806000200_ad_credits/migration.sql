-- Ad credits: non-withdrawable advertiser ad-spend wallet + credit ledger.

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'AD_CREDIT_PURCHASE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adCreditBalance" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AdCreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" DECIMAL(18,6) NOT NULL,
    "kind" TEXT NOT NULL,
    "balanceAfter" DECIMAL(18,6),
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCreditLedger_userId_createdAt_idx" ON "AdCreditLedger"("userId", "createdAt");
