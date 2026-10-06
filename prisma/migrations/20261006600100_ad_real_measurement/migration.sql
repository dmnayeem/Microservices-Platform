-- Real ad measurement: raw measured events + daily rollup.
-- Additive only. Safe to re-run.

CREATE TABLE IF NOT EXISTS "AdEvent" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,
    "reason" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "costUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "viewerHash" TEXT NOT NULL,
    "netHash" TEXT NOT NULL,
    "userId" TEXT,
    "country" VARCHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdEvent_nonce_kind_key" ON "AdEvent"("nonce", "kind");
CREATE INDEX IF NOT EXISTS "AdEvent_createdAt_idx" ON "AdEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AdEvent_viewerHash_createdAt_idx" ON "AdEvent"("viewerHash", "createdAt");
CREATE INDEX IF NOT EXISTS "AdEvent_netHash_createdAt_idx" ON "AdEvent"("netHash", "createdAt");
CREATE INDEX IF NOT EXISTS "AdEvent_adId_createdAt_idx" ON "AdEvent"("adId", "createdAt");

CREATE TABLE IF NOT EXISTS "AdMeasureDaily" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "served" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "validViews" INTEGER NOT NULL DEFAULT 0,
    "invalidViews" INTEGER NOT NULL DEFAULT 0,
    "internalViews" INTEGER NOT NULL DEFAULT 0,
    "validClicks" INTEGER NOT NULL DEFAULT 0,
    "invalidClicks" INTEGER NOT NULL DEFAULT 0,
    "internalClicks" INTEGER NOT NULL DEFAULT 0,
    "estClicks" INTEGER NOT NULL DEFAULT 0,
    "invalidEstClicks" INTEGER NOT NULL DEFAULT 0,
    "scriptExecs" INTEGER NOT NULL DEFAULT 0,
    "invalidScriptExecs" INTEGER NOT NULL DEFAULT 0,
    "spendUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "invalidReasons" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdMeasureDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdMeasureDaily_adId_placement_network_date_key" ON "AdMeasureDaily"("adId", "placement", "network", "date");
CREATE INDEX IF NOT EXISTS "AdMeasureDaily_date_idx" ON "AdMeasureDaily"("date");
