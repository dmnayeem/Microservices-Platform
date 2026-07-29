-- Verified platform links (anti-fraud Phase C): real Telegram/Discord user-ids
-- captured via Login Widget / OAuth so a bot can confirm channel/guild membership.
-- (Other pending tables/columns are handled by their own earlier migrations.)

-- CreateTable
CREATE TABLE "LinkedPlatformAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "username" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedPlatformAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LinkedPlatformAccount_platform_platformUserId_idx" ON "LinkedPlatformAccount"("platform", "platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedPlatformAccount_userId_platform_key" ON "LinkedPlatformAccount"("userId", "platform");

-- AddForeignKey
ALTER TABLE "LinkedPlatformAccount" ADD CONSTRAINT "LinkedPlatformAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
