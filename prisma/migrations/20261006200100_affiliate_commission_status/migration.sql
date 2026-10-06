-- AffiliateCommission reversal state: a refunded sale's commission is marked
-- REVERSED (and excluded from affiliate stats) instead of counting forever.
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);

-- Commissions already reversed before this column existed (their reversing
-- ledger row is the record) are marked so stats stop counting them.
UPDATE "AffiliateCommission" c
SET "status" = 'REVERSED', "reversedAt" = t."createdAt"
FROM "Transaction" t
WHERE t."userId" = c."affiliateUserId"
  AND t."reference" = 'affiliate_reversal_' || c."sourceType" || '_' || c."orderRef"
  AND c."status" = 'ACTIVE';
