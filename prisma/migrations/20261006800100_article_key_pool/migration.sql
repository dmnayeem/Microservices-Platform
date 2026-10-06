-- Article key pool: on-demand key minting + fast claims at any pool size.

CREATE TABLE IF NOT EXISTS "ArticleKeyPool" (
    "taskId" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 0,
    "buffer" INTEGER NOT NULL DEFAULT 2000,
    "minted" INTEGER NOT NULL DEFAULT 0,
    "autoPurgeDays" INTEGER NOT NULL DEFAULT 7,
    "purgedTotal" INTEGER NOT NULL DEFAULT 0,
    "lastPurgedAt" TIMESTAMP(3),
    "purgeRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArticleKeyPool_pkey" PRIMARY KEY ("taskId")
);

DO $$ BEGIN
  ALTER TABLE "ArticleKeyPool" ADD CONSTRAINT "ArticleKeyPool_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fresh (never handed out) keys only. Claims pick the next one by id through
-- this index instead of `ORDER BY random()` over the whole pool, so a claim
-- costs the same at 100 keys or 2,000,000. Raw SQL only (partial index) —
-- protected in scripts/check-migration-drops.ts.
CREATE INDEX IF NOT EXISTS "ArticleTaskKey_fresh_idx" ON "ArticleTaskKey"("taskId", "id")
  WHERE "claimedByUserId" IS NULL AND "issuedAt" IS NULL AND "submissionId" IS NULL;
