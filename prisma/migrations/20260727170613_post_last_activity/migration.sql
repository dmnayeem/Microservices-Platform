-- Smart-feed freshness signal. Backfill existing rows to their createdAt so the
-- initial ordering matches post age; then make it NOT NULL + default now().
ALTER TABLE "Post" ADD COLUMN "lastActivityAt" TIMESTAMP(3);
UPDATE "Post" SET "lastActivityAt" = "createdAt";
ALTER TABLE "Post" ALTER COLUMN "lastActivityAt" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "lastActivityAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Post_isPublic_isHidden_lastActivityAt_idx" ON "Post"("isPublic", "isHidden", "lastActivityAt");
