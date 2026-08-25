-- Finance console: capture the course fee, and index the per-type time series.
--
-- `CourseEnrollment.platformFeeUsd` — `splitCoursePrice()` has always computed
-- the platform's cut, but it was only ever written into
-- `Transaction.metadata.platformFee`. Course revenue therefore could not be
-- summed without opening every JSON blob, and no screen ever tried. Marketplace
-- has had `MarketplacePurchase.fee` since it shipped; this is the same idea.
-- Nullable on purpose: rows written before today genuinely do not know their fee.
--
-- `Transaction @@index([type, createdAt])` — the existing
-- `(status, createdAt)` index is documented as the "monthly finance rollup"
-- index and leads on status, so it cannot serve `GROUP BY type` over a date
-- window. Every per-source chart in the console needs this one.
--
-- Additive: one nullable column and one index. Nothing existing is altered.

ALTER TABLE "CourseEnrollment" ADD COLUMN IF NOT EXISTS "platformFeeUsd" DECIMAL(18,6);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");
