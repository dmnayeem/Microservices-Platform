CREATE TABLE IF NOT EXISTS "AdServeDailyStat" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "fills" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdServeDailyStat_pkey" PRIMARY KEY ("id")
);
