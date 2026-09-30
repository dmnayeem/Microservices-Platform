-- Abuse Center (2026-09-29). Additive only: two new tables, their indexes and
-- one foreign key. Nothing existing is altered. Re-runnable.
--
-- AbuseEvidence -> AbuseCase is RESTRICT: evidence is append-only and must
-- survive; a case with evidence cannot be deleted out from under it.

CREATE TABLE IF NOT EXISTS "AbuseCase" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "signalCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openKey" TEXT,
    "assignedToId" TEXT,
    "resolution" TEXT,
    "providerRef" TEXT,
    "withdrawalsHeld" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbuseCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AbuseEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbuseEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AbuseCase_openKey_key" ON "AbuseCase"("openKey");
CREATE INDEX IF NOT EXISTS "AbuseCase_status_lastSeenAt_idx" ON "AbuseCase"("status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "AbuseCase_severity_idx" ON "AbuseCase"("severity");
CREATE INDEX IF NOT EXISTS "AbuseCase_kind_idx" ON "AbuseCase"("kind");
CREATE INDEX IF NOT EXISTS "AbuseCase_userId_idx" ON "AbuseCase"("userId");
CREATE INDEX IF NOT EXISTS "AbuseCase_entityType_entityId_idx" ON "AbuseCase"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AbuseEvidence_caseId_createdAt_idx" ON "AbuseEvidence"("caseId", "createdAt");
CREATE INDEX IF NOT EXISTS "AbuseEvidence_kind_idx" ON "AbuseEvidence"("kind");

DO $$ BEGIN
  ALTER TABLE "AbuseEvidence" ADD CONSTRAINT "AbuseEvidence_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "AbuseCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
