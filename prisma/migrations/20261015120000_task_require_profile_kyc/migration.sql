-- Task gates: 100% profile and approved KYC before a task can be started.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requireProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "requireKyc" BOOLEAN NOT NULL DEFAULT false;
