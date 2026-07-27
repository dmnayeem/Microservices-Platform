-- Admin-gated post sharing: new per-plan capability columns (default OFF, granted
-- per-user via featureOverrides), plus flip Boost to opt-in.
ALTER TABLE "Package" ADD COLUMN "shareLinksEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Package" ADD COLUMN "shareYoutubeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Boost is now an admin-granted capability. New default is OFF; existing plans are
-- switched off too so nobody keeps boost until an admin re-grants it.
ALTER TABLE "Package" ALTER COLUMN "boostEnabled" SET DEFAULT false;
UPDATE "Package" SET "boostEnabled" = false;
