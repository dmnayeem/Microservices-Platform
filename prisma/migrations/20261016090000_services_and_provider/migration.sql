-- Services split from the marketplace: a package feature and an application type.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "sellServicesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "CreatorApplicationType" ADD VALUE IF NOT EXISTS 'SERVICE_PROVIDER';
