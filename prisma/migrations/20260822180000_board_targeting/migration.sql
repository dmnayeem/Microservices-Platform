-- Task Boards gain the same eligibility + audience targeting columns Task has.
-- All additive with defaults, so every existing board keeps behaving exactly as
-- it does today (minLevel 1 / accessLevel 0 / no targeting = visible to all).
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "minLevel" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "requiredAccessLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "genders" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "divisions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "districts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "subDistricts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "postalCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "minAge" INTEGER;
ALTER TABLE "TaskBoard" ADD COLUMN IF NOT EXISTS "maxAge" INTEGER;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskBoard_isActive_requiredAccessLevel_minLevel_idx" ON "TaskBoard"("isActive", "requiredAccessLevel", "minLevel");
