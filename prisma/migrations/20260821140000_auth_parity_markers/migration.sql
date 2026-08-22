-- Auth parity markers: first-login onboarding + Google link tracking.
--
-- APPLIED TO THE LIVE DATABASE with `prisma db execute`, one statement per
-- invocation, then `migrate resolve --applied` — see MIGRATIONS.md. Both columns
-- are nullable with no default, so PG 11+ makes these catalog-only (no table
-- rewrite, sub-millisecond) even with real users on the table.
--
-- IMPORTANT: after adding the columns, `onboardedAt` was backfilled for every
-- existing user (see below). That MUST happen before any application code reads
-- the column, or the middleware redirects the entire userbase to /welcome.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleLinkedAt" TIMESTAMP(3);

UPDATE "User" SET "onboardedAt" = COALESCE("createdAt", now())
 WHERE "onboardedAt" IS NULL;
