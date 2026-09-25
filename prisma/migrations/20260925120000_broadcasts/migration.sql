-- Broadcasts: durable, resumable admin notification + email sends.

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "imageUrl" TEXT,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "channels" JSONB NOT NULL,
    "targetKind" TEXT NOT NULL,
    "criteria" JSONB,
    "userIds" TEXT[],
    "packages" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "scheduledFor" TIMESTAMP(3),
    "audienceReady" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "inAppSent" INTEGER NOT NULL DEFAULT 0,
    "pushSent" INTEGER NOT NULL DEFAULT 0,
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "inAppAt" TIMESTAMP(3),
    "emailAt" TIMESTAMP(3),
    "emailError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Broadcast_status_scheduledFor_idx" ON "Broadcast"("status", "scheduledFor");
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_userId_key" ON "BroadcastRecipient"("broadcastId", "userId");
CREATE INDEX "BroadcastRecipient_broadcastId_emailAt_idx" ON "BroadcastRecipient"("broadcastId", "emailAt");
CREATE INDEX "BroadcastRecipient_broadcastId_inAppAt_idx" ON "BroadcastRecipient"("broadcastId", "inAppAt");
CREATE INDEX "BroadcastRecipient_emailAt_idx" ON "BroadcastRecipient"("emailAt");

ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
