CREATE TABLE IF NOT EXISTS "FinanceAlertLog" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceAlertLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceAlertLog_key_key" ON "FinanceAlertLog"("key");
CREATE INDEX IF NOT EXISTS "FinanceAlertLog_createdAt_idx" ON "FinanceAlertLog"("createdAt");
