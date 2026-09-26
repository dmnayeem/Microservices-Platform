-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fpHash" TEXT,
    "userAgent" TEXT,
    "lastIp" TEXT,
    "ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDevice_deviceId_idx" ON "UserDevice"("deviceId");

-- CreateIndex
CREATE INDEX "UserDevice_fpHash_idx" ON "UserDevice"("fpHash");

-- CreateIndex
CREATE INDEX "UserDevice_lastIp_idx" ON "UserDevice"("lastIp");

-- CreateIndex
CREATE INDEX "UserDevice_lastSeenAt_idx" ON "UserDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceId_key" ON "UserDevice"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

