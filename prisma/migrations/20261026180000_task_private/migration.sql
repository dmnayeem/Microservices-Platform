-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "superAdminOnly" BOOLEAN NOT NULL DEFAULT false;
