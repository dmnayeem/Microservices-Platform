CREATE TABLE IF NOT EXISTS "FeedbackRound" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "intro" TEXT,
  "questions" JSONB NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "rewardPoints" INTEGER NOT NULL DEFAULT 0,
  "minLevel" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackRound_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeedbackRound_status_endAt_idx" ON "FeedbackRound"("status", "endAt");

CREATE TABLE IF NOT EXISTS "FeedbackResponse" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "rewarded" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackResponse_roundId_userId_key" ON "FeedbackResponse"("roundId", "userId");
DO $$ BEGIN
  ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FeedbackRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FeatureIdea" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "votes" INTEGER NOT NULL DEFAULT 0,
  "adminNote" TEXT,
  "shippedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureIdea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeatureIdea_status_votes_idx" ON "FeatureIdea"("status", "votes");
CREATE INDEX IF NOT EXISTS "FeatureIdea_userId_createdAt_idx" ON "FeatureIdea"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "FeatureIdeaVote" (
  "id" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureIdeaVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureIdeaVote_ideaId_userId_key" ON "FeatureIdeaVote"("ideaId", "userId");
