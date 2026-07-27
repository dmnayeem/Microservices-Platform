-- Index for the social-earning batch reward's lifetime distinct-post count
-- (COUNT(DISTINCT "postId") filtered by userId + action).
CREATE INDEX "SocialActionLog_userId_action_postId_idx" ON "SocialActionLog"("userId", "action", "postId");
