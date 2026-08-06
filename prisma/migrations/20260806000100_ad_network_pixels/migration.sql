-- Ad network (AdSense / Google Ad Manager) config + optional tracking pixels.
ALTER TABLE "Ad"
  ADD COLUMN "adSlot" TEXT,
  ADD COLUMN "adUnitPath" TEXT,
  ADD COLUMN "adClient" TEXT,
  ADD COLUMN "impressionPixel" TEXT,
  ADD COLUMN "clickTracker" TEXT;
