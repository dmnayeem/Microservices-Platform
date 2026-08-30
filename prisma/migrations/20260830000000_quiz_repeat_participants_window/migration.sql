-- Quiz: repeat cadence, a global participant cap, and a scheduling window.
--
-- Every column is nullable or defaulted so existing rows keep behaving exactly
-- as they do today: repeat = ONCE is the current one-shot rule, and a NULL
-- maxParticipants / startsAt / expiresAt means "no cap, no window".
--
-- Written idempotently because this was applied statement-by-statement against
-- the live database first (`prisma db execute --file`, one statement per file —
-- note there is NO --schema flag in this Prisma version; passing one makes every
-- call fail with a usage error while looking like it succeeded). Re-running the
-- whole file must not then fail on the columns that already exist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuizRepeat') THEN
    CREATE TYPE "QuizRepeat" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY');
  END IF;
END $$;

ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "repeat" "QuizRepeat" NOT NULL DEFAULT 'ONCE';
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "maxParticipants" INTEGER;
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "Quiz" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Quiz_status_startsAt_expiresAt_idx" ON "Quiz"("status", "startsAt", "expiresAt");
