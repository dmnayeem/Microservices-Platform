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
