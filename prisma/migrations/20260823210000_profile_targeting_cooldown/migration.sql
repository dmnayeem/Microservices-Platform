-- Records when a user last changed a profile field that decides which targeted
-- tasks they are served. All nine of those fields were freely editable with no
-- rate limit and no trail, so a user could set their country to match a
-- high-paying geo-targeted task, complete it, and set it back.
--
-- Nullable with no default: existing rows read as "never changed", which is the
-- correct starting state — nobody is put in cooldown by the migration itself.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "targetingChangedAt" TIMESTAMP(3);
