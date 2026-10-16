-- Member course / listing promotions go through admin review (2026-10-17).
-- CreateTable
CREATE TABLE "PromotionRequest" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "courseId" TEXT,
    "listingId" TEXT,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "packageLabel" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionRequest_status_createdAt_idx" ON "PromotionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionRequest_courseId_idx" ON "PromotionRequest"("courseId");

-- CreateIndex
CREATE INDEX "PromotionRequest_listingId_idx" ON "PromotionRequest"("listingId");

-- CreateIndex
CREATE INDEX "PromotionRequest_userId_idx" ON "PromotionRequest"("userId");

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
