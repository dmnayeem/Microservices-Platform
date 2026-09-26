-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "popup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "popupSeenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_userId_popup_popupSeenAt_idx" ON "Notification"("userId", "popup", "popupSeenAt");

