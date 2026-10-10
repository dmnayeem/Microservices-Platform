ALTER TYPE "TaskType" ADD VALUE IF NOT EXISTS 'VISIT';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "visitConfig" JSONB;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "visitTasksEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS "TaskVisit" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  "reachedAt" TIMESTAMP(3),
  "elapsedSec" INTEGER,
  "outcome" TEXT NOT NULL DEFAULT 'OPEN',
  "verdict" TEXT,
  "referrerHost" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskVisit_taskId_openedAt_idx" ON "TaskVisit"("taskId", "openedAt");
CREATE INDEX IF NOT EXISTS "TaskVisit_submissionId_idx" ON "TaskVisit"("submissionId");
CREATE INDEX IF NOT EXISTS "TaskVisit_userId_openedAt_idx" ON "TaskVisit"("userId", "openedAt");
