-- Itemised lines on a finance entry: conveyance trips, bill items.
-- AlterTable
ALTER TABLE "FinanceEntry" ADD COLUMN     "lineItems" JSONB;

