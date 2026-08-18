import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getAffiliateConfig } from "@/lib/affiliate";
import { getAffiliateStats, type AffiliateStats } from "@/lib/affiliate-stats";
import { AffiliateDashboardView } from "@/components/user/affiliate/affiliate-dashboard-view";

export default async function AffiliatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [me, cfg, pendingAffApp] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, affiliateJoinedAt: true },
    }),
    getAffiliateConfig(),
    prisma.creatorApplication.count({
      where: { userId, type: "AFFILIATE", status: "PENDING" },
    }),
  ]);
  if (!me) redirect("/login");

  const joined = !!me.affiliateJoinedAt;

  // Full per-affiliate stats (views/clicks/sales/earnings/by-item/recent) +
  // promotable catalogue — only when joined (cheap otherwise).
  const [stats, listings, courses] = joined
    ? await Promise.all([
        getAffiliateStats(userId),
        prisma.marketplaceListing.findMany({
          where: {
            status: "ACTIVE",
            affiliateCommissionType: { not: null },
            sellerId: { not: userId },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            title: true,
            price: true,
            affiliateCommissionType: true,
            affiliateCommissionValue: true,
          },
        }),
        prisma.course.findMany({
          where: {
            status: "PUBLISHED",
            affiliateCommissionType: { not: null },
            tutorId: { not: userId },
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            slug: true,
            title: true,
            price: true,
            discountPrice: true,
            affiliateCommissionType: true,
            affiliateCommissionValue: true,
          },
        }),
      ])
    : [null as AffiliateStats | null, [], []];

  return (
    <AffiliateDashboardView
      joined={joined}
      programEnabled={cfg.enabled}
      requireApproval={cfg.requireApproval}
      pendingApplication={pendingAffApp > 0}
      code={me.referralCode}
      stats={
        stats
          ? {
              views: stats.views,
              clicks: stats.clicks,
              sales: stats.sales,
              earnings: stats.earnings,
              conversionRate: stats.conversionRate,
              byItem: stats.byItem,
              recent: stats.recent.map((r) => ({
                id: r.id,
                type: r.type,
                title: r.title,
                amount: r.amount,
                createdAt: r.createdAt.toISOString(),
              })),
            }
          : null
      }
      items={[
        ...listings.map((l) => ({
          key: `m_${l.id}`,
          title: l.title,
          url: `/marketplace/${l.id}`,
          rewardType: l.affiliateCommissionType as "PERCENT" | "FIXED",
          rewardValue: toNum(l.affiliateCommissionValue ?? 0),
          kind: "Product" as const,
        })),
        ...courses.map((c) => ({
          key: `c_${c.id}`,
          title: c.title,
          url: `/courses/${c.slug ?? c.id}`,
          rewardType: c.affiliateCommissionType as "PERCENT" | "FIXED",
          rewardValue: toNum(c.affiliateCommissionValue ?? 0),
          kind: "Course" as const,
        })),
      ]}
    />
  );
}
