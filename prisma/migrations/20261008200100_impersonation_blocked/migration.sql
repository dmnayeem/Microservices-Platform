-- Super admin can protect an account from "Login as user".
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "impersonationBlocked" BOOLEAN NOT NULL DEFAULT false;
