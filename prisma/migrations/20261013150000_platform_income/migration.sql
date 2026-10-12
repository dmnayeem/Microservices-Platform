-- Third-party platform income (AdSense, Adsterra, Monetag, Amazon …), entered
-- by finance admins per day, plus the month-end actual payout.
CREATE TABLE IF NOT EXISTS "IncomePlatform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Ad network',
    "networkKey" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IncomePlatform_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncomePlatform_name_key" ON "IncomePlatform"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "IncomePlatform_networkKey_key" ON "IncomePlatform"("networkKey");
CREATE INDEX IF NOT EXISTS "IncomePlatform_isActive_idx" ON "IncomePlatform"("isActive");

CREATE TABLE IF NOT EXISTS "PlatformIncomeEntry" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountUsd" DECIMAL(18,6) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "voidReason" TEXT,
    "enteredById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformIncomeEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformIncomeEntry_platformId_date_key" ON "PlatformIncomeEntry"("platformId", "date");
CREATE INDEX IF NOT EXISTS "PlatformIncomeEntry_date_status_idx" ON "PlatformIncomeEntry"("date", "status");

CREATE TABLE IF NOT EXISTS "PlatformPayout" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "actualUsd" DECIMAL(18,6) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "reference" TEXT,
    "note" TEXT,
    "enteredById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlatformPayout_platformId_period_key" ON "PlatformPayout"("platformId", "period");
CREATE INDEX IF NOT EXISTS "PlatformPayout_period_idx" ON "PlatformPayout"("period");

DO $$ BEGIN
  ALTER TABLE "PlatformIncomeEntry" ADD CONSTRAINT "PlatformIncomeEntry_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "IncomePlatform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlatformPayout" ADD CONSTRAINT "PlatformPayout_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "IncomePlatform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
