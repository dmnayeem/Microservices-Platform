import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { getAffiliateConfig } from "@/lib/affiliate";
import { AffiliateDashboardView } from "@/components/user/affiliate/affiliate-dashboard-view";

export default async function AffiliatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [me, cfg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, affiliateJoinedAt: true },
    }),
    getAffiliateConfig(),
  ]);
  if (!me) redirect("/login");

  const joined = !!me.affiliateJoinedAt;

  // Earnings + promotable catalogue (only when joined — cheap otherwise).
  const [agg, recentRaw, listings, courses] = joined
    ? await Promise.all([
        prisma.affiliateCommission.aggregate({
          where: { affiliateUserId: userId },
          _sum: { commissionAmount: true },
          _count: { _all: true },
        }),
        prisma.affiliateCommission.findMany({
          where: { affiliateUserId: userId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
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
    : [null, [], [], []];

  // Resolve titles for the recent-commission feed.
  const listingIds = recentRaw
    .filter((r) => r.sourceType === "MARKETPLACE")
    .map((r) => r.sourceId);
  const courseIds = recentRaw
    .filter((r) => r.sourceType === "COURSE")
    .map((r) => r.sourceId);
  const [lTitles, cTitles] = await Promise.all([
    listingIds.length
      ? prisma.marketplaceListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    courseIds.length
      ? prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  const titleMap = new Map<string, string>([
    ...lTitles.map((l) => [l.id, l.title] as [string, string]),
    ...cTitles.map((c) => [c.id, c.title] as [string, string]),
  ]);

  return (
    <AffiliateDashboardView
      joined={joined}
      programEnabled={cfg.enabled}
      code={me.referralCode}
      totalEarned={toNum(agg?._sum.commissionAmount ?? 0)}
      salesCount={agg?._count._all ?? 0}
      recent={recentRaw.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        title: titleMap.get(r.sourceId) ?? "(removed)",
        amount: toNum(r.commissionAmount),
        createdAt: r.createdAt.toISOString(),
      }))}
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
