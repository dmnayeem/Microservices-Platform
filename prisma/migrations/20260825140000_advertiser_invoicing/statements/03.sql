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
