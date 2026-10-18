-- VISIT tasks: in-app viewer facts on each open (lib/visit-tasks.ts).
ALTER TABLE "TaskVisit" ADD COLUMN IF NOT EXISTS "viewer" TEXT;
ALTER TABLE "TaskVisit" ADD COLUMN IF NOT EXISTS "scrollPct" INTEGER;
ALTER TABLE "TaskVisit" ADD COLUMN IF NOT EXISTS "clicks" INTEGER;
