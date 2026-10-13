-- Per-task colour of the Instructions block (lib/task-instructions-color); null = orange.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "instructionsColor" TEXT;
