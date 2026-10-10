CREATE TABLE IF NOT EXISTS "VisitPass" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "verdict" TEXT NOT NULL,
  "referrerHost" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  "usedByUserId" TEXT,
  "submissionId" TEXT,
  CONSTRAINT "VisitPass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisitPass_code_key" ON "VisitPass"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "VisitPass_submissionId_key" ON "VisitPass"("submissionId");
CREATE INDEX IF NOT EXISTS "VisitPass_taskId_createdAt_idx" ON "VisitPass"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "VisitPass_ip_createdAt_idx" ON "VisitPass"("ip", "createdAt");
