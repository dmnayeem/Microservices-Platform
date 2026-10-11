CREATE TABLE IF NOT EXISTS "AmbassadorApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmbassadorApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AmbassadorApplication_userId_key" ON "AmbassadorApplication"("userId");
CREATE INDEX IF NOT EXISTS "AmbassadorApplication_status_idx" ON "AmbassadorApplication"("status");

CREATE TABLE IF NOT EXISTS "AmbassadorPayout" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "qualified" INTEGER NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmbassadorPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AmbassadorPayout_userId_month_key" ON "AmbassadorPayout"("userId", "month");
CREATE INDEX IF NOT EXISTS "AmbassadorPayout_month_idx" ON "AmbassadorPayout"("month");
