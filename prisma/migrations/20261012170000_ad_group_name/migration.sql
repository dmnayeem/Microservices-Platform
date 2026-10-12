ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "groupName" TEXT;
CREATE INDEX IF NOT EXISTS "Ad_groupName_idx" ON "Ad"("groupName");
