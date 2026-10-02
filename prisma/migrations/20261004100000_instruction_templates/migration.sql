-- Instruction templates for admin task creation (2026-10-04). Additive only:
-- one new table, nothing existing is touched. Re-runnable.
--
-- Safe to deploy before this is applied: nothing outside the template picker
-- and /admin/tasks/templates reads the table, both fail soft on a missing
-- table ("Templates aren't set up yet"), and the task-create usage bump is
-- wrapped in a catch.

CREATE TABLE IF NOT EXISTS "InstructionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "taskType" TEXT,
    "contentHtml" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InstructionTemplate_name_key" ON "InstructionTemplate"("name");
CREATE INDEX IF NOT EXISTS "InstructionTemplate_category_idx" ON "InstructionTemplate"("category");
