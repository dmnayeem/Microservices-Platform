-- A broadcast can be a service notice rather than marketing: it reaches
-- registered users who have switched marketing email off, and is not held back
-- by our own daily cap.
ALTER TABLE "Broadcast" ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false;

-- Important broadcasts go first, and the sweep looks them up by status.
CREATE INDEX "Broadcast_status_important_createdAt_idx" ON "Broadcast"("status", "important", "createdAt");
