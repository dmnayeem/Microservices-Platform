-- Donation posts collect real points from real people, so the ability to open
-- one is admin-granted rather than universal. Default OFF: nobody keeps a
-- capability they were never deliberately given.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "donationsEnabled" BOOLEAN NOT NULL DEFAULT false;
