-- Hot-path indexes for the traffic ramp.
--
-- Strictly additive: indexes only, no drops, no type changes, no data movement.
-- Every statement uses CONCURRENTLY so a live table is never write-locked while
-- the index builds, and IF NOT EXISTS so this file is safe to re-run.
--
-- CONCURRENTLY cannot run inside a transaction block, so this migration MUST be
-- applied one statement at a time via `prisma db execute` and then recorded with
-- `prisma migrate resolve --applied`. It will FAIL under `prisma migrate deploy`.
-- See MIGRATIONS.md.
--
-- After applying, check that none were left behind as invalid:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;

-- ── Post: the main feed ─────────────────────────────────────────────────────
-- Filters isPublic/isHidden/isAnnouncement/isPromoted, sorts [isPinned,
-- lastActivityAt]. The closest existing index omitted isPinned, so every feed
-- load sorted the whole matching set.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_isPublic_isHidden_isAnnouncement_isPromoted_isPinned_l_idx"
  ON "Post" ("isPublic", "isHidden", "isAnnouncement", "isPromoted", "isPinned", "lastActivityAt");
-- Declared in the schema but absent from the live database until now.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_boostedUntil_idx"
  ON "Post" ("boostedUntil");
-- Profile timelines, and the per-day post-limit count run on every new post.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_userId_createdAt_idx"
  ON "Post" ("userId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Post_userId_isPublic_isHidden_createdAt_idx"
  ON "Post" ("userId", "isPublic", "isHidden", "createdAt");

-- ── User: followersCount had no index at all ────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_followersCount_idx"
  ON "User" ("followersCount");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_status_followersCount_idx"
  ON "User" ("status", "followersCount");

-- ── Notification: fastest-growing table ─────────────────────────────────────
-- The live-class dedup check filters on `type` + a JSON path with no other
-- bound; without this it is a sequential scan every 15 minutes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_type_createdAt_idx"
  ON "Notification" ("type", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_userId_type_createdAt_idx"
  ON "Notification" ("userId", "type", "createdAt");
-- The nightly retention prune.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_isRead_createdAt_idx"
  ON "Notification" ("isRead", "createdAt");

-- ── TaskSubmission ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskSubmission_createdAt_idx"
  ON "TaskSubmission" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskSubmission_status_reviewedAt_idx"
  ON "TaskSubmission" ("status", "reviewedAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskSubmission_taskId_status_idx"
  ON "TaskSubmission" ("taskId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskSubmission_taskId_createdAt_idx"
  ON "TaskSubmission" ("taskId", "createdAt");

-- ── AuditLog: filter and sort were in separate indexes ──────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_userId_createdAt_idx"
  ON "AuditLog" ("userId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_entity_createdAt_idx"
  ON "AuditLog" ("entity", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_userId_action_entity_idx"
  ON "AuditLog" ("userId", "action", "entity");

-- ── Transaction ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_status_createdAt_idx"
  ON "Transaction" ("status", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Transaction_userId_type_createdAt_idx"
  ON "Transaction" ("userId", "type", "createdAt");

-- ── Task: the user-facing list ──────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_status_hidden_order_createdAt_idx"
  ON "Task" ("status", "hidden", "order", "createdAt");
-- Unindexed FK: deleting a TaskBoard SET NULLs every task.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_boardId_idx"
  ON "Task" ("boardId");

-- ── LotteryTicket ───────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LotteryTicket_userId_createdAt_idx"
  ON "LotteryTicket" ("userId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LotteryTicket_isWinner_createdAt_idx"
  ON "LotteryTicket" ("isWinner", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LotteryTicket_userId_isWinner_idx"
  ON "LotteryTicket" ("userId", "isWinner");

-- ── SocialActionLog ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SocialActionLog_userId_createdAt_idx"
  ON "SocialActionLog" ("userId", "createdAt");

-- ── Unindexed FKs on per-session log tables (SET NULL on user delete) ───────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MarketplaceListingView_userId_idx"
  ON "MarketplaceListingView" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CourseListingView_userId_idx"
  ON "CourseListingView" ("userId");

-- ── Trigram indexes for the ILIKE '%q%' searches ────────────────────────────
-- /api/search and /api/users/search use `contains`, which no btree can serve;
-- today every keystroke is a sequential scan. GIN builds are slow, hence
-- CONCURRENTLY here in particular.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_name_trgm_idx"
  ON "User" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_username_trgm_idx"
  ON "User" USING gin (lower("username") gin_trgm_ops);
