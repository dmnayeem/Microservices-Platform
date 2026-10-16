import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getSetting } from "@/lib/system-settings";
import { AdminTabs, pickTab } from "@/components/admin/ui/admin-tabs";
import { getBoostPricing } from "@/lib/boost/core";
import { BOOST_PRICING_KEY } from "@/lib/boost/pricing";
import { COUNTRY_OPTIONS, parseTargeting } from "@/lib/ad-targeting";
import { BoostAllList, BoostReviewList, type BoostRow } from "./boosts-client";
import { BoostPricingForm } from "./pricing-form";

/**
 * Members' post boosts (owner, 2026-10-16): the review queue, every boost with
 * its numbers and controls, and the price list. The money side is
 * src/lib/boost/core.ts; this page only reads and calls its routes.
 */
const TABS = [
  { id: "review", label: "Review queue" },
  { id: "all", label: "All boosts" },
  { id: "pricing", label: "Pricing" },
];

const STATUSES = ["ALL", "PENDING", "ACTIVE", "PAUSED", "COMPLETED", "REJECTED", "CANCELLED"] as const;
const PAGE = 50;

const ROW_SELECT = {
  id: true,
  status: true,
  paidWith: true,
  budgetPoints: true,
  spentPoints: true,
  refundedPoints: true,
  durationDays: true,
  targeting: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  rejectReason: true,
  impressions: true,
  views: true,
  clicks: true,
  likes: true,
  comments: true,
  shares: true,
  postId: true,
  userId: true,
} satisfies Prisma.BoostCampaignSelect;

const countryName = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c.name]));

/** Plain-language audience lines for the admin ("Everyone" when no rule). */
function describeAudience(raw: unknown): string[] {
  const t = parseTargeting(raw);
  const out: string[] = [];
  if (t.countries?.length) out.push(`Countries: ${t.countries.map((c) => countryName.get(c.toUpperCase()) ?? c).join(", ")}`);
  const geo = [...(t.regions ?? []), ...(t.divisions ?? []), ...(t.districts ?? []), ...(t.subDistricts ?? []), ...(t.cities ?? [])];
  if (geo.length) out.push(`Areas: ${geo.join(", ")}`);
  if (t.postalCodes?.length) out.push(`Postal codes: ${t.postalCodes.join(", ")}`);
  if (t.genders?.length) out.push(`Gender: ${t.genders.map((g) => g.toLowerCase()).join(", ")}`);
  if (t.minAge || t.maxAge) out.push(`Age: ${t.minAge ?? "any"}–${t.maxAge ?? "any"}`);
  if (t.minLevel || t.maxLevel) out.push(`Level: ${t.minLevel ?? "any"}–${t.maxLevel ?? "any"}`);
  if (t.languages?.length) out.push(`Language: ${t.languages.join(", ")}`);
  if (t.packages?.length) out.push(`Packages: ${t.packages.join(", ")}`);
  if (t.kycStatuses?.length) out.push(`KYC: ${t.kycStatuses.join(", ")}`);
  if (t.verifiedOnly) out.push("Verified members only");
  if (t.tags?.length) out.push(`Tags: ${t.tags.join(", ")}`);
  if (t.minAccountAgeDays) out.push(`Account at least ${t.minAccountAgeDays} days old`);
  if (t.activeWithinDays) out.push(`Active in the last ${t.activeWithinDays} days`);
  const dev = [...(t.deviceTypes ?? []), ...(t.deviceOses ?? []), ...(t.deviceBrands ?? [])];
  if (dev.length) out.push(`Devices: ${dev.join(", ")}`);
  return out.length ? out : ["Everyone"];
}

/**
 * Boost rows plus their post and owner. The post and owner are read in two
 * batched lookups rather than a nested select: in the full program the nested
 * BoostCampaign select loses its result type (it types as the bare row), and
 * two `in` reads are just as cheap.
 */
async function loadRows(
  where: Prisma.BoostCampaignWhereInput,
  opts: { skip?: number; take: number; oldestFirst?: boolean }
): Promise<BoostRow[]> {
  const rows = await prisma.boostCampaign.findMany({
    where,
    select: ROW_SELECT,
    orderBy: { createdAt: opts.oldestFirst ? "asc" : "desc" },
    skip: opts.skip ?? 0,
    take: opts.take,
  });
  const postIds = [...new Set(rows.map((r) => r.postId).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [posts, users] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, content: true, images: true, isHidden: true },
        })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, email: true, avatar: true },
    }),
  ]);
  const postById = new Map(posts.map((x) => [x.id, x]));
  const userById = new Map(users.map((x) => [x.id, x]));
  return rows.map((r) => {
    const post = r.postId ? postById.get(r.postId) : undefined;
    const user = userById.get(r.userId);
    return {
      id: r.id,
      status: r.status,
      paidWith: r.paidWith,
      budgetPoints: r.budgetPoints,
      spentPoints: r.spentPoints,
      refundedPoints: r.refundedPoints,
      durationDays: r.durationDays,
      audience: describeAudience(r.targeting),
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      rejectReason: r.rejectReason,
      counts: {
        IMPRESSION: r.impressions,
        VIEW: r.views,
        CLICK: r.clicks,
        LIKE: r.likes,
        COMMENT: r.comments,
        SHARE: r.shares,
      },
      post: post
        ? { id: post.id, content: (post.content ?? "").slice(0, 400), image: post.images[0] ?? null, isHidden: post.isHidden }
        : null,
      owner: {
        id: r.userId,
        name: user?.name || user?.username || user?.email || "Unknown member",
        username: user?.username ?? null,
        avatar: user?.avatar ?? null,
      },
    };
  });
}

export default async function AdminBoostsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "social.promote"))) redirect("/admin");

  const sp = await searchParams;
  const tab = pickTab(TABS, sp.tab);
  const pendingCount = await prisma.boostCampaign.count({ where: { status: "PENDING" } });

  let body: React.ReactNode;
  if (tab === "pricing") {
    const canEdit = await can(session.user.id, "settings.edit");
    const [pricing, row, legacyCap] = await Promise.all([
      getBoostPricing(),
      prisma.systemSetting.findUnique({ where: { key: BOOST_PRICING_KEY }, select: { key: true } }),
      getSetting<unknown>("feed.boost_max_per_user", null),
    ]);
    // Before the first save, carry over the old "max times shown per user"
    // (Feed settings → General), which this page replaces — 0 still = unlimited.
    const legacy = Number(legacyCap);
    const initial =
      !row && legacyCap !== null && Number.isFinite(legacy) && legacy >= 0
        ? { ...pricing, maxPerViewer: Math.min(1000, Math.round(legacy)) }
        : pricing;
    body = <BoostPricingForm initial={initial} canEdit={canEdit} saved={!!row} />;
  } else if (tab === "all") {
    const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "ALL";
    const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
    const where: Prisma.BoostCampaignWhereInput = status === "ALL" ? {} : { status };
    const real = STATUSES.filter((x) => x !== "ALL");
    const [rows, perStatus] = await Promise.all([
      loadRows(where, { skip: (page - 1) * PAGE, take: PAGE + 1 }),
      Promise.all(real.map((x) => prisma.boostCampaign.count({ where: { status: x } }))),
    ]);
    const counts: Record<string, number> = { ALL: 0 };
    real.forEach((x, i) => {
      counts[x] = perStatus[i];
      counts.ALL += perStatus[i];
    });
    body = (
      <BoostAllList
        rows={rows.slice(0, PAGE)}
        status={status}
        statuses={[...STATUSES]}
        counts={counts}
        page={page}
        hasMore={rows.length > PAGE}
      />
    );
  } else {
    const rows = await loadRows({ status: "PENDING" }, { take: 100, oldestFirst: true });
    body = <BoostReviewList rows={rows} total={pendingCount} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Post boosts</h1>
        <p className="mt-1 text-sm text-slate-400">
          Members pay Ad Points (or Ad Fund) to show a post to more people. The whole budget is held when they boost;
          each counted event is charged at the price on the Pricing tab, and whatever is not spent goes back to them
          when the boost ends, is rejected or is stopped.
          {pendingCount > 0 && <span className="ml-1 font-semibold text-amber-300">{pendingCount} waiting for review.</span>}
        </p>
      </div>
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/boosts" />
      {body}
    </div>
  );
}
