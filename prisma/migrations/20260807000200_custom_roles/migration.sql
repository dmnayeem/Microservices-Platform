-- Super-admin-defined custom roles + per-user assignment.
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");
CREATE UNIQUE INDEX "CustomRole_slug_key" ON "CustomRole"("slug");
CREATE INDEX "CustomRole_isActive_idx" ON "CustomRole"("isActive");

ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT;
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
