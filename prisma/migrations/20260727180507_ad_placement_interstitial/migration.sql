-- Per-space interstitial ad duration (seconds). Null = default 5s.
ALTER TABLE "AdPlacement" ADD COLUMN "interstitialSeconds" INTEGER;
