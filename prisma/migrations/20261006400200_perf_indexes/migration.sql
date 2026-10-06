-- Performance indexes. All IF NOT EXISTS; plain CREATE INDEX (no CONCURRENTLY)
-- so the file runs under `prisma migrate deploy`. Each one briefly blocks
-- writes on its table while it builds — Transaction is the largest table, so
-- deploy this at a quiet hour (see MIGRATIONS.md).

-- Subscription expiry sweeps: isActive = true AND endDate < now().
-- Schema: @@index([isActive, endDate])
CREATE INDEX IF NOT EXISTS "Subscription_isActive_endDate_idx" ON "Subscription"("isActive", "endDate");

-- Prefix lookups on Transaction.reference (LIKE 'prefix%' / startsWith). The
-- existing plain "Transaction_reference_idx" cannot serve LIKE under a non-C
-- collation. Schema: @@index([reference(ops: raw("text_pattern_ops"))],
-- map: "Transaction_reference_pattern_idx") — the map is required because
-- Prisma's default name would collide with "Transaction_reference_idx".
CREATE INDEX IF NOT EXISTS "Transaction_reference_pattern_idx" ON "Transaction"("reference" text_pattern_ops);

-- Buyer-report status filter on TaskSubmission.metadata. An EXPRESSION index:
-- Prisma cannot declare it, so it exists only here. RAW-SQL, MUST NOT BE
-- DROPPED by a generated migration (scripts/check-migration-drops.ts).
CREATE INDEX IF NOT EXISTS "TaskSubmission_buyerReport_status_idx" ON "TaskSubmission"(((metadata->'buyerReport'->>'status')));

-- Marketplace purchase status filters (pending/refund queues).
-- Schema: @@index([status])
CREATE INDEX IF NOT EXISTS "MarketplacePurchase_status_idx" ON "MarketplacePurchase"("status");
