-- CreateEnum
CREATE TYPE "CreatorApplicationType" AS ENUM ('MARKETPLACE_SELLER', 'ADVERTISER', 'AGENCY', 'AFFILIATE');

-- CreateEnum
CREATE TYPE "CreatorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CreatorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreatorApplicationType" NOT NULL,
    "status" "CreatorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB,
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "CreatorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatorApplication_userId_idx" ON "CreatorApplication"("userId");

-- CreateIndex
CREATE INDEX "CreatorApplication_status_idx" ON "CreatorApplication"("status");

-- CreateIndex
CREATE INDEX "CreatorApplication_type_idx" ON "CreatorApplication"("type");

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorApplication" ADD CONSTRAINT "CreatorApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
