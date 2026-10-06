-- Manually entered third-party ad network revenue (per day, per network).
CREATE TABLE IF NOT EXISTS "AdNetworkRevenue" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "network" TEXT NOT NULL,
    "revenueUsd" DECIMAL(18,6) NOT NULL,
    "note" TEXT,
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdNetworkRevenue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdNetworkRevenue_date_network_key" ON "AdNetworkRevenue"("date", "network");
CREATE INDEX IF NOT EXISTS "AdNetworkRevenue_network_date_idx" ON "AdNetworkRevenue"("network", "date");
