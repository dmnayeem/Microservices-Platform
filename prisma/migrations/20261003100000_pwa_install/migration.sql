-- PWA install tracking + install reward (2026-10-03). Additive only: six
-- nullable/defaulted columns on "User", one index, one enum value. Nothing
-- existing is altered. Re-runnable.
--
-- Must be applied BEFORE the code that reads these columns is deployed:
-- Prisma selects every scalar column of "User" on a plain findUnique, so a
-- missing column breaks every page, not just the new one.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaFirstSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaLastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaPlatform" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaRewardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaHost" TEXT;

CREATE INDEX IF NOT EXISTS "User_pwaFirstSeenAt_idx" ON "User"("pwaFirstSeenAt");

-- Event / Mission action: "install the app". Written once per goal per user by
-- src/lib/pwa-install.ts through recordUserAction.
ALTER TYPE "EventActionType" ADD VALUE IF NOT EXISTS 'PWA_INSTALLED';
