-- Feed post link-click tracking: total + unique clicks (owner-only report).
-- Two counters on Post + a per-distinct-user PostLinkClick table (mirrors PostView).

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "linkClicksCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "uniqueLinkClicksCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PostLinkClick" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLinkClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostLinkClick_postId_idx" ON "PostLinkClick"("postId");
CREATE INDEX "PostLinkClick_userId_idx" ON "PostLinkClick"("userId");
CREATE INDEX "PostLinkClick_clickedAt_idx" ON "PostLinkClick"("clickedAt");
CREATE UNIQUE INDEX "PostLinkClick_postId_userId_key" ON "PostLinkClick"("postId", "userId");

-- AddForeignKey
ALTER TABLE "PostLinkClick" ADD CONSTRAINT "PostLinkClick_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostLinkClick" ADD CONSTRAINT "PostLinkClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
