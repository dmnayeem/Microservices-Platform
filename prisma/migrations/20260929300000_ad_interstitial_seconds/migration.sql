-- Per-ad full-screen timing (2026-09-29). Null keeps the space setting.
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "skipAfterSeconds" INTEGER;
ALTER TABLE "Ad" ADD COLUMN IF NOT EXISTS "showSeconds" INTEGER;
