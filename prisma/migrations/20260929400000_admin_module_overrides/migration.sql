-- Per-admin admin-page (module) visibility (2026-09-29). Additive only.
-- The role/global rules live in SystemSetting `admin_modules.rules` (no DDL).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "moduleOverrides" JSONB;
