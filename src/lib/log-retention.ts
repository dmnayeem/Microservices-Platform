import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { pruneRateLimitHits } from "@/lib/rate-limit-db";

/**
 * Retention pruning for append-only, high-volume tables (view/impression logs,
 * social-action log, audit log, read notifications). Deletes rows older than a
 * configurable window in BOUNDED batches so a run can't lock a table for long
 * or blow up on the first pass — successive daily runs catch up. Windows come
 * from the `retention_days` SystemSetting (defaults below).
 */

const DAY = 86_400_000;
const BATCH = 5_000;
/**
 * Safety stop, not the normal exit. The loop below runs until a table is
 * actually drained or the time budget is spent — a fixed batch cap silently
 * capped deletion at 100k rows/model/day, which is BELOW the daily insert rate
 * of AdEngagement and PageVisitDaily. Retention then falls permanently behind
 * while still reporting success, and the tables grow without bound.
 */
const MAX_BATCHES = 400; // ≤2M rows per model per run
/** Wall-clock budget per model, so one huge table can't starve the rest. */
const BUDGET_MS = 20_000;

interface RetentionConfig {
  views: number;
  logs: number;
  audit: number;
  notifications: number;
}
const DEFAULTS: RetentionConfig = { views: 90, logs: 120, audit: 365, notifications: 60 };

async function getRetention(): Promise<RetentionConfig> {
  const v = await getSetting<Partial<RetentionConfig>>("retention_days", DEFAULTS);
  return { ...DEFAULTS, ...(v ?? {}) };
}

async function pruneBatched(
  find: () => Promise<Array<{ id: string }>>,
  del: (ids: string[]) => Promise<unknown>
): Promise<number> {
  let total = 0;
  const deadline = Date.now() + BUDGET_MS;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await find();
    if (rows.length === 0) break;
    await del(rows.map((r) => r.id));
    total += rows.length;
    // Drained this table.
    if (rows.length < BATCH) break;
    // Out of budget — the next run picks up where this one stopped.
    if (Date.now() >= deadline) break;
  }
  return total;
}

/** Prune old rows across the append-only tables. Returns per-table delete counts. */
export async function pruneOldLogs(): Promise<Record<string, number>> {
  const cfg = await getRetention();
  const now = Date.now();
  const cViews = new Date(now - cfg.views * DAY);
  const cLogs = new Date(now - cfg.logs * DAY);
  const cAudit = new Date(now - cfg.audit * DAY);
  const cNotif = new Date(now - cfg.notifications * DAY);
  const r: Record<string, number> = {};

  r.adView = await pruneBatched(
    () => prisma.adView.findMany({ where: { createdAt: { lt: cLogs } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.adView.deleteMany({ where: { id: { in: ids } } })
  );
  // Engagement dedup slots are only useful for their cooldown window — 30 days
  // is already far past any of them, and this table is the highest-volume one.
  r.adEngagement = await pruneBatched(
    () => prisma.adEngagement.findMany({ where: { createdAt: { lt: new Date(now - 30 * DAY) } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.adEngagement.deleteMany({ where: { id: { in: ids } } })
  );
  r.socialActionLog = await pruneBatched(
    () => prisma.socialActionLog.findMany({ where: { createdAt: { lt: cLogs } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.socialActionLog.deleteMany({ where: { id: { in: ids } } })
  );
  // Social-earning ratio progress. **Only DAILY rows may be pruned** — a daily
  // row is dead once its day has passed, but a `lifetime` row (dateKey "*") IS
  // the durable milestone counter.
  //
  // Deleting lifetime rows would recreate exactly the bug SocialRatioTally was
  // built to fix: the old ratio derived its count from SocialActionLog above, so
  // pruning made the count go backwards and long-lived users silently stopped
  // earning milestones forever. Do not remove this filter.
  const PRUNABLE_TALLY_WINDOW = "daily";
  r.socialRatioTally = await pruneBatched(
    () => prisma.socialRatioTally.findMany({
      where: { window: PRUNABLE_TALLY_WINDOW, updatedAt: { lt: cLogs } },
      select: { id: true },
      take: BATCH,
    }),
    (ids) => prisma.socialRatioTally.deleteMany({ where: { id: { in: ids } } })
  );
  r.postView = await pruneBatched(
    () => prisma.postView.findMany({ where: { viewedAt: { lt: cViews } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.postView.deleteMany({ where: { id: { in: ids } } })
  );
  r.marketplaceListingView = await pruneBatched(
    () => prisma.marketplaceListingView.findMany({ where: { viewedAt: { lt: cViews } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.marketplaceListingView.deleteMany({ where: { id: { in: ids } } })
  );
  r.courseListingView = await pruneBatched(
    () => prisma.courseListingView.findMany({ where: { viewedAt: { lt: cViews } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.courseListingView.deleteMany({ where: { id: { in: ids } } })
  );
  // Raw per-visitor dedup rows for page analytics. The PageDailyStat rollup is
  // NOT pruned (aggregates kept long-term, like AdDailyStat).
  r.pageVisitDaily = await pruneBatched(
    () => prisma.pageVisitDaily.findMany({ where: { createdAt: { lt: cViews } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.pageVisitDaily.deleteMany({ where: { id: { in: ids } } })
  );
  r.auditLog = await pruneBatched(
    () => prisma.auditLog.findMany({ where: { createdAt: { lt: cAudit } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.auditLog.deleteMany({ where: { id: { in: ids } } })
  );
  // Only prune READ notifications past the window; unread are always kept.
  r.notification = await pruneBatched(
    () => prisma.notification.findMany({ where: { isRead: true, createdAt: { lt: cNotif } }, select: { id: true }, take: BATCH }),
    (ids) => prisma.notification.deleteMany({ where: { id: { in: ids } } })
  );

  // Idempotency keys are only meaningful for the life of a retry (minutes), but
  // one row is written per money POST and each stores the full JSON response.
  // The table has an index built for pruning and nothing ever pruned it.
  r.idempotencyKey = await pruneBatched(
    () =>
      prisma.idempotencyKey.findMany({
        where: { createdAt: { lt: new Date(now - 2 * DAY) } },
        select: { id: true },
        take: BATCH,
      }),
    (ids) => prisma.idempotencyKey.deleteMany({ where: { id: { in: ids } } })
  );

  // Expired shared rate-limit counters.
  r.rateLimitHit = await pruneRateLimitHits();

  return r;
}
