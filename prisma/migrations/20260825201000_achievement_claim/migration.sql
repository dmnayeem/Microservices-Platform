-- Unlocking an achievement and being paid for it are separate steps. Nothing
-- had ever written a `UserAchievement` row, so switching the unlock engine on
-- without this would have credited every existing user for every threshold they
-- had already crossed the moment they loaded the page.

ALTER TABLE "UserAchievement" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
