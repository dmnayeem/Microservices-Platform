-- Admin review: persistent feedback + penalty record on task submissions.
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "feedback" TEXT;
ALTER TABLE "TaskSubmission" ADD COLUMN IF NOT EXISTS "penaltyPoints" INTEGER;
