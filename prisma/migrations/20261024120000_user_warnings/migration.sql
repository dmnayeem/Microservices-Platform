-- Fraud Monitor → member warnings (pop-up with reply, re-shown until answered).
CREATE TABLE IF NOT EXISTS "UserWarning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fraudEventId" TEXT,
    "issue" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "shownCount" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "nextShowAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWarning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserWarning_userId_repliedAt_idx" ON "UserWarning"("userId", "repliedAt");
CREATE INDEX IF NOT EXISTS "UserWarning_createdAt_idx" ON "UserWarning"("createdAt");
