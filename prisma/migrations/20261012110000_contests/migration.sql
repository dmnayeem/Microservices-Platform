CREATE TABLE IF NOT EXISTS "Contest" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rules" TEXT,
  "coverImage" TEXT,
  "platforms" TEXT[] DEFAULT ARRAY['ANY']::TEXT[],
  "hashtag" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "votingEndsAt" TIMESTAMP(3) NOT NULL,
  "voteWeightPct" INTEGER NOT NULL DEFAULT 50,
  "minLevelToEnter" INTEGER NOT NULL DEFAULT 0,
  "minLevelToVote" INTEGER NOT NULL DEFAULT 3,
  "maxEntriesPerUser" INTEGER NOT NULL DEFAULT 1,
  "prizes" JSONB NOT NULL,
  "participationPoints" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "finalizedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Contest_status_endAt_idx" ON "Contest"("status", "endAt");

CREATE TABLE IF NOT EXISTS "ContestEntry" (
  "id" TEXT NOT NULL,
  "contestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "caption" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "linkCheck" TEXT,
  "rejectReason" TEXT,
  "adminScore" INTEGER,
  "votes" INTEGER NOT NULL DEFAULT 0,
  "rank" INTEGER,
  "prizePoints" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContestEntry_contestId_url_key" ON "ContestEntry"("contestId", "url");
CREATE INDEX IF NOT EXISTS "ContestEntry_contestId_status_idx" ON "ContestEntry"("contestId", "status");
CREATE INDEX IF NOT EXISTS "ContestEntry_contestId_userId_idx" ON "ContestEntry"("contestId", "userId");
DO $$ BEGIN
  ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContestVote" (
  "id" TEXT NOT NULL,
  "contestId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContestVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContestVote_contestId_userId_key" ON "ContestVote"("contestId", "userId");
CREATE INDEX IF NOT EXISTS "ContestVote_entryId_idx" ON "ContestVote"("entryId");
