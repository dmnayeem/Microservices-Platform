import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";

/**
 * Retention pruning for append-only, high-volume tables (view/impression logs,
 * social-action log, audit log, read notifications). Deletes rows older than a
 * configurable window in BOUNDED batches so a run can't lock a table for long
 * or blow up on the first pass — successive daily runs catch up. Windows come
 * from the `retention_days` SystemSetting (defaults below).
 */

const DAY = 86_400_000;
const BATCH = 5_000;
const MAX_BATCHES = 20; // ≤100k rows per model per run

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
  for (let i = 0; i < MAX_BATCHES; i++) {
    const rows = await find();
    if (rows.length === 0) break;
    await del(rows.map((r) => r.id));
    total += rows.length;
    if (rows.length < BATCH) break;
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

  return r;
}
