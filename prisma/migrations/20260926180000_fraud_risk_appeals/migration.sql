-- AlterTable
ALTER TABLE "FraudEvent" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "riskPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fraudRisk" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "SuspensionAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "riskAtAppeal" INTEGER NOT NULL DEFAULT 0,
    "reasonAtAppeal" TEXT,
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspensionAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuspensionAppeal_userId_idx" ON "SuspensionAppeal"("userId");

-- CreateIndex
CREATE INDEX "SuspensionAppeal_status_createdAt_idx" ON "SuspensionAppeal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FraudEvent_dedupeKey_key" ON "FraudEvent"("dedupeKey");

-- AddForeignKey
ALTER TABLE "SuspensionAppeal" ADD CONSTRAINT "SuspensionAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

