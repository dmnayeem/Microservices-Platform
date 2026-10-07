-- PWA: when the installed app was removed (Chrome/Edge offered "Install" again).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pwaUninstalledAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_pwaUninstalledAt_idx" ON "User"("pwaUninstalledAt");
