-- Deals become a plan feature (on by default); blue badge and deal access can be applied for.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "dealsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TYPE "CreatorApplicationType" ADD VALUE IF NOT EXISTS 'BLUE_BADGE';
ALTER TYPE "CreatorApplicationType" ADD VALUE IF NOT EXISTS 'DEALS';
