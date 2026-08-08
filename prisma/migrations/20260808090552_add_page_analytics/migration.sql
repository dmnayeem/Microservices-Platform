-- CreateTable
CREATE TABLE "PageDailyStat" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitors" INTEGER NOT NULL DEFAULT 0,
    "totalDwellSec" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVisitDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVisitDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageDailyStat_kind_date_idx" ON "PageDailyStat"("kind", "date");

-- CreateIndex
CREATE INDEX "PageDailyStat_date_idx" ON "PageDailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PageDailyStat_kind_key_date_key" ON "PageDailyStat"("kind", "key", "date");

-- CreateIndex
CREATE INDEX "PageVisitDaily_createdAt_idx" ON "PageVisitDaily"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageVisitDaily_kind_key_date_visitorHash_key" ON "PageVisitDaily"("kind", "key", "date", "visitorHash");
