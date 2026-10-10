ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupMedium" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupCampaign" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupReferrer" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupLanding" TEXT;
CREATE INDEX IF NOT EXISTS "User_signupSource_createdAt_idx" ON "User"("signupSource", "createdAt");
