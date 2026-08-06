-- Per-user RBAC permission grants/denials, mirroring featureOverrides.
-- { [permission]: boolean } applied on top of the role's effective set.
ALTER TABLE "User" ADD COLUMN "permissionOverrides" JSONB;
