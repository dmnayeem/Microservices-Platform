-- CreateTable
CREATE TABLE "UserActiveDay" (
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActiveDay_pkey" PRIMARY KEY ("userId","date")
);

-- CreateIndex
CREATE INDEX "UserActiveDay_date_idx" ON "UserActiveDay"("date");

-- AddForeignKey
ALTER TABLE "UserActiveDay" ADD CONSTRAINT "UserActiveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
