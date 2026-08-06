-- Add new roles. Postgres cannot use a freshly-added enum value in the same
-- transaction it is created, so these enum additions live in their own migration,
-- separate from the permissionOverrides column add.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AGENCY';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AD_MANAGER';
