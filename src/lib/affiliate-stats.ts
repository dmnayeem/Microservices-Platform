import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/**
 * Per-affiliate performance for the /affiliate dashboard. Views = total link
 * opens (all AffiliateClick rows); Clicks = unique visitors (distinct
 * visitorHash); Sales/Earnings from AffiliateCommission; plus a per-item
 * breakdown (which product/course drove views/sales/earnings) and recent
 * commissions. Fail-safe: zeros/empty on error.
 */

export interface AffiliateItemStat {
  key: string; // `${type}:${id}`
  type: "MARKETPLACE" | "COURSE";
  id: string;
  title: string;
  views: number;
  sales: number;
  earned: number;
}

export interface AffiliateRecent {
  id: string;
  type: "MARKETPLACE" | "COURSE";
  title: string;
  amount: number;
  createdAt: Date;
}

export interface AffiliateStats {
  views: number;
  clicks: number; // unique visitors
  sales: number;
  earnings: number;
  conversionRate: number; // % of (unique clicks, or views) that converted
  byItem: AffiliateItemStat[];
  recent: AffiliateRecent[];
}

const EMPTY: AffiliateStats = {
  views: 0,
  clicks: 0,
  sales: 0,
  earnings: 0,
  conversionRate: 0,
  byItem: [],
  recent: [],
};

export async function getAffiliateStats(userId: string): Promise<AffiliateStats> {
  try {
    const [views, uniqueGroups, saleAgg, clicksByTarget, salesBySource, recentRaw] =
      await Promise.all([
        prisma.affiliateClick.count({ where: { affiliateUserId: userId } }),
        // Distinct non-null visitor hashes = unique clicks.
        prisma.affiliateClick.groupBy({
          by: ["visitorHash"],
          where: { affiliateUserId: userId, visitorHash: { not: null } },
        }) as unknown as Promise<{ visitorHash: string | null }[]>,
        prisma.affiliateCommission.aggregate({
          where: { affiliateUserId: userId },
          _count: { _all: true },
          _sum: { commissionAmount: true },
        }) as unknown as Promise<{
          _count: { _all: number };
          _sum: { commissionAmount: string | number | null };
        }>,
        prisma.affiliateClick.groupBy({
          by: ["targetType", "targetId"],
          where: { affiliateUserId: userId },
          _count: { _all: true },
        }) as unknown as Promise<
          { targetType: string; targetId: string; _count: { _all: number } }[]
        >,
        prisma.affiliateCommission.groupBy({
          by: ["sourceType", "sourceId"],
          where: { affiliateUserId: userId },
          _count: { _all: true },
          _sum: { commissionAmount: true },
        }) as unknown as Promise<
          {
            sourceType: string;
            sourceId: string;
            _count: { _all: number };
            _sum: { commissionAmount: string | number | null };
          }[]
        >,
        prisma.affiliateCommission.findMany({
          where: { affiliateUserId: userId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            commissionAmount: true,
            createdAt: true,
          },
        }),
      ]);

    const clicks = uniqueGroups.length;
    const sales = saleAgg._count._all;
    const earnings = toNum(saleAgg._sum.commissionAmount ?? 0);
    const denom = clicks || views;
    const conversionRate = denom > 0 ? (sales / denom) * 100 : 0;

    // Merge per-item views + sales/earnings, keyed by `${type}:${id}`.
    const items = new Map<string, AffiliateItemStat>();
    const ensure = (type: string, id: string): AffiliateItemStat => {
      const key = `${type}:${id}`;
      let it = items.get(key);
      if (!it) {
        it = {
          key,
          type: type === "COURSE" ? "COURSE" : "MARKETPLACE",
          id,
          title: type === "COURSE" ? "Course" : "Product",
          views: 0,
          sales: 0,
          earned: 0,
        };
        items.set(key, it);
      }
      return it;
    };
    for (const c of clicksByTarget) ensure(c.targetType, c.targetId).views += c._count._all;
    for (const s of salesBySource) {
      const it = ensure(s.sourceType, s.sourceId);
      it.sales += s._count._all;
      it.earned += toNum(s._sum.commissionAmount ?? 0);
    }

    // Resolve titles for all referenced ids + the recent list.
    const listingIds = new Set<string>();
    const courseIds = new Set<string>();
    for (const it of items.values())
      (it.type === "COURSE" ? courseIds : listingIds).add(it.id);
    for (const r of recentRaw)
      (r.sourceType === "COURSE" ? courseIds : listingIds).add(r.sourceId);

    const [listings, courses] = await Promise.all([
      listingIds.size
        ? prisma.marketplaceListing.findMany({
            where: { id: { in: [...listingIds] } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as { id: string; title: string }[]),
      courseIds.size
        ? prisma.course.findMany({
            where: { id: { in: [...courseIds] } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as { id: string; title: string }[]),
    ]);
    const titleOf = (type: string, id: string): string => {
      const src = type === "COURSE" ? courses : listings;
      return src.find((x) => x.id === id)?.title ?? (type === "COURSE" ? "Course" : "Product");
    };
    for (const it of items.values()) it.title = titleOf(it.type, it.id);

    const byItem = [...items.values()].sort((a, b) => b.views - a.views).slice(0, 20);

    const recent: AffiliateRecent[] = recentRaw.map((r) => ({
      id: r.id,
      type: r.sourceType === "COURSE" ? "COURSE" : "MARKETPLACE",
      title: titleOf(r.sourceType, r.sourceId),
      amount: toNum(r.commissionAmount),
      createdAt: r.createdAt,
    }));

    return { views, clicks, sales, earnings, conversionRate, byItem, recent };
  } catch (e) {
    console.error("getAffiliateStats failed:", e);
    return EMPTY;
  }
}
