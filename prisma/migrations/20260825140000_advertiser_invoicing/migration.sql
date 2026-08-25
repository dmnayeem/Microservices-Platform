-- Advertiser billing: a profile, invoices, invoice lines, and the ledger guard
-- that makes "mark paid" safe to click twice.
--
-- Before this there was no invoice, receipt, order or billing document anywhere
-- in the schema, and no advertiser billing identity at all — no company name,
-- tax id, address or billing email. Selling ads directly means sending someone a
-- bill, and there was nothing to send.
--
-- The AdCreditLedger unique index is the important one. `Transaction` has had
-- @@unique([userId, reference]) all along; the credit ledger never did, so it
-- had no DB-level replay protection whatsoever. With it, an invoice settled
-- twice credits once, because the reference is deterministic (`invoice_<id>`).
-- Statement 00 proves there are no existing duplicates before it is built.
--
-- Additive: three new tables plus one index. Nothing existing is altered.

CREATE TABLE IF NOT EXISTS "BillingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgName" TEXT,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BILL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "billTo" JSONB,
    "subtotalUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discountUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "taxPct" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "taxLabel" TEXT,
    "taxUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "paymentRef" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "unitUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "amountUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'AD_CREDIT',
    "refId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "BillingProfile_userId_key" ON "BillingProfile"("userId");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_advertiserId_createdAt_idx" ON "Invoice"("advertiserId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- The replay guard. See the header.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "AdCreditLedger_userId_reference_key" ON "AdCreditLedger"("userId", "reference");
