-- Marketplace escrow "deals" + buyer↔seller chat threads (admin-joinable) +
-- optional admin-mediation charge. Adds two enum values, one new enum, and
-- three tables. No existing data is touched.

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'ADMIN_FEE';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE';

-- CreateEnum
CREATE TYPE "MarketplaceDealStatus" AS ENUM ('PROPOSED', 'FUNDED', 'DELIVERED', 'RELEASED', 'REFUNDED', 'CANCELLED', 'DISPUTED');

-- CreateTable
CREATE TABLE "MarketplaceThread" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "assignedAdminId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadBuyer" INTEGER NOT NULL DEFAULT 0,
    "unreadSeller" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceDeal" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" "MarketplaceDealStatus" NOT NULL DEFAULT 'PROPOSED',
    "adminMediated" BOOLEAN NOT NULL DEFAULT false,
    "adminFee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "assignedAdminId" TEXT,
    "heldAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "commissionBps" INTEGER,
    "affiliateUserId" TEXT,
    "affiliateAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "purchaseId" TEXT,
    "autoReleaseAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceDeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceThread_listingId_buyerId_key" ON "MarketplaceThread"("listingId", "buyerId");
CREATE INDEX "MarketplaceThread_buyerId_idx" ON "MarketplaceThread"("buyerId");
CREATE INDEX "MarketplaceThread_sellerId_idx" ON "MarketplaceThread"("sellerId");
CREATE INDEX "MarketplaceThread_lastMessageAt_idx" ON "MarketplaceThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "MarketplaceThreadMessage_threadId_idx" ON "MarketplaceThreadMessage"("threadId");
CREATE INDEX "MarketplaceThreadMessage_senderId_idx" ON "MarketplaceThreadMessage"("senderId");

-- CreateIndex
CREATE INDEX "MarketplaceDeal_threadId_idx" ON "MarketplaceDeal"("threadId");
CREATE INDEX "MarketplaceDeal_listingId_idx" ON "MarketplaceDeal"("listingId");
CREATE INDEX "MarketplaceDeal_buyerId_idx" ON "MarketplaceDeal"("buyerId");
CREATE INDEX "MarketplaceDeal_sellerId_idx" ON "MarketplaceDeal"("sellerId");
CREATE INDEX "MarketplaceDeal_status_idx" ON "MarketplaceDeal"("status");
CREATE INDEX "MarketplaceDeal_assignedAdminId_idx" ON "MarketplaceDeal"("assignedAdminId");
CREATE INDEX "MarketplaceDeal_autoReleaseAt_idx" ON "MarketplaceDeal"("autoReleaseAt");

-- AddForeignKey
ALTER TABLE "MarketplaceThread" ADD CONSTRAINT "MarketplaceThread_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceThreadMessage" ADD CONSTRAINT "MarketplaceThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MarketplaceThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDeal" ADD CONSTRAINT "MarketplaceDeal_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MarketplaceThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceDeal" ADD CONSTRAINT "MarketplaceDeal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
