CREATE TABLE IF NOT EXISTS "SpotlightAuction" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "biddingEndsAt" TIMESTAMP(3) NOT NULL,
  "displayHours" INTEGER NOT NULL DEFAULT 24,
  "minBid" INTEGER NOT NULL DEFAULT 100,
  "bidStep" INTEGER NOT NULL DEFAULT 10,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "winnerUserId" TEXT,
  "winnerPostId" TEXT,
  "winnerBid" INTEGER,
  "awardedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpotlightAuction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SpotlightAuction_status_biddingEndsAt_idx" ON "SpotlightAuction"("status", "biddingEndsAt");

CREATE TABLE IF NOT EXISTS "SpotlightBid" (
  "id" TEXT NOT NULL,
  "auctionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'HELD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpotlightBid_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpotlightBid_auctionId_userId_key" ON "SpotlightBid"("auctionId", "userId");
CREATE INDEX IF NOT EXISTS "SpotlightBid_auctionId_status_idx" ON "SpotlightBid"("auctionId", "status");
DO $$ BEGIN
  ALTER TABLE "SpotlightBid" ADD CONSTRAINT "SpotlightBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "SpotlightAuction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
