-- Task.repeat: DAILY | ONCE | NULL (= the type default, see src/lib/task-repeat.ts).
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "repeat" TEXT;
