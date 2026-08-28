-- Reaction type on a like. One row per (post, user) whatever the emoji, so
-- `Post.likesCount` keeps meaning "people who reacted" and every existing sort,
-- counter and notification stays correct. The default means every existing like
-- reads as 👍 with no backfill.
ALTER TABLE "Like" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'LIKE';

CREATE INDEX IF NOT EXISTS "Like_postId_type_idx" ON "Like"("postId", "type");

-- Saved posts. Private to the user — no counters, no points.
CREATE TABLE IF NOT EXISTS "SavedPost" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SavedPost_userId_postId_key" ON "SavedPost"("userId", "postId");

CREATE INDEX IF NOT EXISTS "SavedPost_userId_createdAt_idx" ON "SavedPost"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "SavedPost_postId_idx" ON "SavedPost"("postId");

ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedPost" ADD CONSTRAINT "SavedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
