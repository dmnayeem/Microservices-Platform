import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { Handshake, Coins, Users, TrendingUp } from "lucide-react";

export default async function AdminAffiliatePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "marketplace.view")) redirect("/admin");

  const [agg, activeAffiliates, byAffiliateRaw, recentRaw] = await Promise.all([
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
  ]);

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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat icon={<Coins className="w-5 h-5" />} label="Total paid" value={`$${totalPaid.toFixed(2)}`} tone="text-emerald-400" />
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="Commissions" value={agg._count._all.toLocaleString()} tone="text-indigo-400" />
        <Stat icon={<Users className="w-5 h-5" />} label="Affiliates joined" value={activeAffiliates.toLocaleString()} tone="text-amber-400" />
      </div>

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
                    ${toNum(a._sum.commissionAmount ?? 0).toFixed(2)}
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
                    {new Date(r.createdAt).toLocaleDateString()} · sale ${toNum(r.saleAmount).toFixed(2)}
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-400 tabular-nums">
                  +${toNum(r.commissionAmount).toFixed(2)}
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
