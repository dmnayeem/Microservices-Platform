-- Audit 2026-09-28.

-- Admin analytics count new / recently-active users by date.
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt");

-- The payment-gateway callback looks the deposit up by its transaction id.
CREATE INDEX IF NOT EXISTS "Deposit_gatewayRef_idx" ON "Deposit"("gatewayRef");

-- One in-progress (started, not yet handed in) submission per user per task.
-- Two /start calls at once both passed the daily-limit count and opened two
-- rows, each of which could then be submitted and paid. The start routes
-- catch the violation and hand back the row that won.
CREATE UNIQUE INDEX IF NOT EXISTS "TaskSubmission_one_open_per_user_task"
  ON "TaskSubmission"("taskId", "userId")
  WHERE "status" = 'PENDING' AND "submittedAt" IS NULL;

-- Quizzes are graded the moment they are submitted, but /api/tasks/quiz never
-- stamped reviewedAt, so those decisions had no time on record.
UPDATE "TaskSubmission" s
SET "reviewedAt" = COALESCE(s."submittedAt", s."updatedAt")
FROM "Task" t
WHERE t.id = s."taskId"
  AND t.type = 'QUIZ'
  AND s.status IN ('AUTO_APPROVED', 'REJECTED')
  AND s."reviewedAt" IS NULL;
