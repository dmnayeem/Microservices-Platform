-- Plans + paid blue badge (2026-10-05). Additive only; re-runnable.
--
-- Package.isPopular / icon: the plan card's "Most popular" ribbon and icon,
-- chosen in /admin/packages.
--
-- User.blueBadgeExpiresAt: a BOUGHT blue badge lapses at this time. Null means
-- an admin granted it and it is permanent - so the badges that exist today are
-- untouched.
--
-- BadgeStyleSubscription: a paid animated/premium badge style, monthly.

ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "isPopular" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "icon" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blueBadgeExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blueBadgeAutoRenew" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "BadgeStyleSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BadgeStyleSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BadgeStyleSubscription_userId_style_key" ON "BadgeStyleSubscription"("userId", "style");
CREATE INDEX IF NOT EXISTS "BadgeStyleSubscription_expiresAt_idx" ON "BadgeStyleSubscription"("expiresAt");
-- A lapsing-badge sweep reads this.
CREATE INDEX IF NOT EXISTS "User_blueBadgeExpiresAt_idx" ON "User"("blueBadgeExpiresAt") WHERE "blueBadgeExpiresAt" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "BadgeStyleSubscription" ADD CONSTRAINT "BadgeStyleSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
