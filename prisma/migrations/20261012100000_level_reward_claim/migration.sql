CREATE TABLE IF NOT EXISTS "LevelRewardClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LevelRewardClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LevelRewardClaim_userId_level_key" ON "LevelRewardClaim"("userId", "level");
CREATE INDEX IF NOT EXISTS "LevelRewardClaim_level_idx" ON "LevelRewardClaim"("level");
