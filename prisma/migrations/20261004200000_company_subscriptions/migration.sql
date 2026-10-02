-- Company subscriptions & renewals tracker (2026-10-04). Additive only: one new
-- table, nothing existing is touched. Re-runnable.
--
-- Safe to deploy before this is applied: the Subscriptions tab shows "Run the
-- migration to start tracking subscriptions", the overview hint hides itself,
-- and the "finance-subscription-reminders" scheduler job no-ops on a missing
-- table.

CREATE TABLE IF NOT EXISTS "CompanySubscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT,
    "accountRef" TEXT,
    "cost" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingCycle" TEXT NOT NULL,
    "customCycleDays" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remindDaysBefore" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
    "lastRemindedFor" TEXT,
    "notes" TEXT,
    "url" TEXT,
    "customFields" JSONB,
    "payeeId" TEXT,
    "categoryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CompanySubscription_endDate_idx" ON "CompanySubscription"("endDate");
CREATE INDEX IF NOT EXISTS "CompanySubscription_status_idx" ON "CompanySubscription"("status");
