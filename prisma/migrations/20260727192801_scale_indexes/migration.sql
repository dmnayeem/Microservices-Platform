-- Scale hardening for 10M+ users: add indexes on hot / foreign-key / ordering
-- columns, and drop two redundant User indexes already covered by @unique.
DROP INDEX "User_email_idx";
DROP INDEX "User_referralCode_idx";
CREATE INDEX "AdView_adId_idx" ON "AdView"("adId");
CREATE INDEX "AdView_userId_adId_createdAt_idx" ON "AdView"("userId", "adId", "createdAt");
CREATE INDEX "AdView_createdAt_idx" ON "AdView"("createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");
CREATE INDEX "Follow_followingId_createdAt_idx" ON "Follow"("followingId", "createdAt");
CREATE INDEX "Follow_followerId_createdAt_idx" ON "Follow"("followerId", "createdAt");
CREATE INDEX "Mention_mentionedById_idx" ON "Mention"("mentionedById");
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE INDEX "PointGift_createdAt_idx" ON "PointGift"("createdAt");
CREATE INDEX "PostView_viewedAt_idx" ON "PostView"("viewedAt");
CREATE INDEX "SocialActionLog_createdAt_idx" ON "SocialActionLog"("createdAt");
CREATE INDEX "TaskSubmission_status_createdAt_idx" ON "TaskSubmission"("status", "createdAt");
CREATE INDEX "TaskSubmission_userId_status_createdAt_idx" ON "TaskSubmission"("userId", "status", "createdAt");
CREATE INDEX "User_packageId_idx" ON "User"("packageId");
CREATE INDEX "User_xp_idx" ON "User"("xp");
