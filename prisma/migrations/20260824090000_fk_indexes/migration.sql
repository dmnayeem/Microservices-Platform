-- Index every foreign-key column that had no covering index.
--
-- Postgres does NOT create an index for a foreign key. Without one, joining on
-- it is a sequential scan of the child table, and so is the referential check
-- Postgres runs whenever the PARENT row is deleted or its key updated — which
-- is why an unindexed FK makes deletes get slower and slower as a table grows,
-- long before anyone notices the reads.
--
-- All CONCURRENTLY: they cannot run inside a transaction, so each statement is
-- applied on its own via `prisma db execute` (see MIGRATIONS.md). Additive and
-- reversible; nothing about query results changes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CartItem_listingId_idx" ON "CartItem"("listingId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Course_subcategoryId_idx" ON "Course"("subcategoryId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseLesson_quizId_idx" ON "CourseLesson"("quizId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseLesson_assignmentId_idx" ON "CourseLesson"("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseLesson_liveClassId_idx" ON "CourseLesson"("liveClassId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseReview_userId_idx" ON "CourseReview"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseQuestion_answeredById_idx" ON "CourseQuestion"("answeredById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseBookmark_courseId_idx" ON "CourseBookmark"("courseId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseAnnouncement_authorId_idx" ON "CourseAnnouncement"("authorId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseAssignmentSubmission_gradedById_idx" ON "CourseAssignmentSubmission"("gradedById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseCoupon_createdById_idx" ON "CourseCoupon"("createdById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseRefundRequest_enrollmentId_idx" ON "CourseRefundRequest"("enrollmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseRefundRequest_courseId_idx" ON "CourseRefundRequest"("courseId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseRefundRequest_processedById_idx" ON "CourseRefundRequest"("processedById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TutorApplication_reviewedById_idx" ON "TutorApplication"("reviewedById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CreatorApplication_reviewedById_idx" ON "CreatorApplication"("reviewedById");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserAchievement_achievementId_idx" ON "UserAchievement"("achievementId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OfferwallOffer_categoryId_idx" ON "OfferwallOffer"("categoryId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "EventActionLog_userId_idx" ON "EventActionLog"("userId");
