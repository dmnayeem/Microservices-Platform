-- Fill-rate tracking, and the index every platform-wide ad report needed.
--
-- Nothing recorded that an ad was ever REQUESTED. `serveAd` has eight paths that
-- return nothing and write nothing, so a space that never fills was
-- indistinguishable from a space nobody visits — and that is exactly the
-- difference that decides whether a space is worth keeping.
--
-- `AdDailyStat` also had no index on `date` alone, only the composite
-- `(adId, date)`, while every platform-wide report scans `date`. PageDailyStat,
-- which the schema comment says was modelled on this table, has had one all along.
--
-- Additive: a new table plus two indexes. Nothing existing is altered or dropped.
--
-- The CREATE INDEX statements are CONCURRENTLY and so cannot run inside a
-- transaction. Each is applied on its own via `prisma db execute`
-- (see MIGRATIONS.md); `statements/` holds them one per file.

CREATE TABLE IF NOT EXISTS "AdServeDailyStat" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "fills" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdServeDailyStat_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdServeDailyStat" DROP CONSTRAINT IF EXISTS "AdServeDailyStat_placementId_fkey";
ALTER TABLE "AdServeDailyStat" ADD CONSTRAINT "AdServeDailyStat_placementId_fkey"
    FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "AdServeDailyStat_placementId_date_key" ON "AdServeDailyStat"("placementId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdServeDailyStat_date_idx" ON "AdServeDailyStat"("date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AdDailyStat_date_idx" ON "AdDailyStat"("date");
