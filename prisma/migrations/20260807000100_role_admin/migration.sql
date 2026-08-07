-- Generic ADMIN role (below super-admin). Enum-value adds run in their own
-- migration — Postgres can't use a freshly-added enum value in the same txn.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
