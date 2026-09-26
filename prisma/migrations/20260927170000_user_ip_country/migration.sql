-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastCountry" TEXT,
ADD COLUMN     "signupCountry" TEXT;

-- CreateIndex
CREATE INDEX "User_lastCountry_idx" ON "User"("lastCountry");

-- CreateIndex
CREATE INDEX "User_signupCountry_idx" ON "User"("signupCountry");
