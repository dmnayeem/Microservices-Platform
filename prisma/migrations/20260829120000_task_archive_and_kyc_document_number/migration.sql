-- 1. ARCHIVED task status.
-- Deleting a task that has submissions is impossible (TaskSubmission.taskId is
-- Restrict by design — those rows back real payments, and every ledger entry is
-- keyed `task_<taskId>_<submissionId>`). 52 of 102 live tasks were in that
-- state and the admin's Delete button returned a bare 500. Archiving retires
-- the task without touching the money trail; `visibleTaskWhere()` matches only
-- ACTIVE, so archived tasks leave every user-facing list on their own.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. The ID number on a KYC document.
-- There was no such column anywhere: the number lived only in `extracted` JSON
-- and only when OCR ran, so the same NID could verify unlimited accounts.
-- Not unique — one user resubmitting their own ID is legitimate.
ALTER TABLE "KYCDocument" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT;

CREATE INDEX IF NOT EXISTS "KYCDocument_documentNumber_idx" ON "KYCDocument"("documentNumber");

-- 3. One verified national ID per account, enforced by the database so a code
-- path that forgets the check still cannot create a duplicate. Zero rows carry
-- a value today, so this applies without a backfill.
CREATE UNIQUE INDEX IF NOT EXISTS "User_nidNumber_key" ON "User"("nidNumber");
