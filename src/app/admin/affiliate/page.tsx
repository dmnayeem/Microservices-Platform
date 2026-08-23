import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { Handshake, Coins, Users, TrendingUp, MousePointerClick, Percent } from "lucide-react";
import { getAffiliateConfig } from "@/lib/affiliate";
import { AffiliateConfigForm } from "@/components/admin/affiliate/affiliate-config-form";

export default async function AdminAffiliatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "marketplace.view"))) redirect("/admin");
  const canManage = await can(session.user.id, "marketplace.manage");

  const affiliateConfig = await getAffiliateConfig();

  const [agg, activeAffiliates, byAffiliateRaw, recentRaw, totalClicks, clicksByTargetRaw] =
    await Promise.all([
      prisma.affiliateCommission.aggregate({
        _sum: { commissionAmount: true },
        _count: { _all: true },
      }),
      prisma.user.count({ where: { affiliateJoinedAt: { not: null } } }),
      prisma.affiliateCommission.groupBy({
        by: ["affiliateUserId"],
        _sum: { commissionAmount: true },
        _count: { _all: true },
        orderBy: { _sum: { commissionAmount: "desc" } },
        take: 20,
      }),
      prisma.affiliateCommission.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      // Click tracking was recorded but never surfaced — build the funnel.
      prisma.affiliateClick.count(),
      prisma.affiliateClick.groupBy({
        by: ["targetType"],
        _count: { _all: true },
      }),
    ]);

  const clicksByTarget = clicksByTargetRaw as unknown as Array<{
    targetType: string;
    _count: { _all: number };
  }>;
  const conversions = agg._count._all;
  // Conversion rate = attributed sales ÷ tracked link clicks.
  const conversionRate =
    totalClicks > 0 ? (conversions / totalClicks) * 100 : 0;

  const byAffiliate = byAffiliateRaw as unknown as Array<{
    affiliateUserId: string;
    _sum: { commissionAmount: number | null };
    _count: { _all: number };
  }>;
  const affIds = byAffiliate.map((a) => a.affiliateUserId);
  const users = affIds.length
    ? await prisma.user.findMany({
        where: { id: { in: affIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const totalPaid = toNum(agg._sum.commissionAmount ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Handshake className="w-6 h-6 text-indigo-400" />
          Affiliate
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Commissions paid to affiliates from marketplace + course sales.
        </p>
      </div>

      {canManage && <AffiliateConfigForm initial={affiliateConfig} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat icon={<Coins className="w-5 h-5" />} label="Total paid" value={`${usd(totalPaid)}`} tone="text-emerald-400" />
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="Commissions" value={conversions.toLocaleString()} tone="text-indigo-400" />
        <Stat icon={<Users className="w-5 h-5" />} label="Affiliates joined" value={activeAffiliates.toLocaleString()} tone="text-amber-400" />
      </div>

      {/* Click → conversion funnel (link clicks were tracked but never shown) */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Traffic &amp; conversion</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<MousePointerClick className="w-5 h-5" />} label="Link clicks" value={totalClicks.toLocaleString()} tone="text-sky-400" />
          <Stat icon={<TrendingUp className="w-5 h-5" />} label="Conversions" value={conversions.toLocaleString()} tone="text-emerald-400" />
          <Stat icon={<Percent className="w-5 h-5" />} label="Conversion rate" value={`${conversionRate.toFixed(1)}%`} tone="text-purple-400" />
          <Stat
            icon={<Handshake className="w-5 h-5" />}
            label="Clicks by type"
            value={
              clicksByTarget.length === 0
                ? "—"
                : clicksByTarget
                    .map((c) => `${c.targetType === "COURSE" ? "Course" : "Product"} ${c._count._all}`)
                    .join(" · ")
            }
            tone="text-amber-400"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Top affiliates</h2>
        <div className="bg-slate-900 rounded-xl border border-slate-800 divide-y divide-slate-800">
          {byAffiliate.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">No commissions yet.</p>
          ) : (
            byAffiliate.map((a) => {
              const u = userMap.get(a.affiliateUserId);
              return (
                <div key={a.affiliateUserId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/admin/users/${a.affiliateUserId}`} className="min-w-0 hover:text-indigo-400">
                    <p className="text-sm text-white truncate">{u?.name || u?.email || a.affiliateUserId}</p>
                    <p className="text-[11px] text-slate-500">{a._count._all} sales</p>
                  </Link>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums">
                    {usd(toNum(a._sum.commissionAmount ?? 0))}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white">Recent commissions</h2>
        <div className="bg-slate-900 rounded-xl border border-slate-800 divide-y divide-slate-800">
          {recentRaw.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 text-center">Nothing yet.</p>
          ) : (
            recentRaw.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {r.sourceType === "COURSE" ? "Course" : "Product"} · {userMap.get(r.affiliateUserId)?.name ?? r.affiliateUserId.slice(0, 8)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString()} · sale {usd(toNum(r.saleAmount))}
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">
                  +{usd(toNum(r.commissionAmount))}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${tone}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-extrabold text-white tabular-nums">{value}</p>
    </div>
  );
}
