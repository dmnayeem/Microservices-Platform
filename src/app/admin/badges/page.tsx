import { redirect } from "next/navigation";
import { BadgeCheck, Coins, Flame, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { getPointsPerUsd } from "@/lib/economy";
import { styleLabel } from "@/lib/badges";
import { VerifiedBadge } from "@/components/user/profile/verified-badge";
import { BadgeConfigEditor } from "./_components/BadgeConfigEditor";

export const dynamic = "force-dynamic";

/** The blue badge shop: who holds what, what it earned, and its prices. */
export default async function AdminBadgesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "packages.view"))) redirect("/admin");
  const canEdit = await can(session.user.id, "packages.edit");

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [bought, granted, styleRowsRaw, sales30, rate] = await Promise.all([
    prisma.user.count({ where: { isBlueVerified: true, blueBadgeExpiresAt: { gt: now } } }),
    prisma.user.count({ where: { isBlueVerified: true, blueBadgeExpiresAt: null } }),
    prisma.badgeStyleSubscription.groupBy({ by: ["style"], where: { expiresAt: { gt: now } }, _count: { _all: true } }),
    prisma.transaction.aggregate({
      where: { type: "PURCHASE", status: "COMPLETED", reference: { startsWith: "badge_" }, createdAt: { gte: since } },
      _sum: { amount: true, points: true },
      _count: true,
    }),
    getPointsPerUsd(),
  ]);
  const recent = await prisma.transaction.findMany({
      where: { type: "PURCHASE" as const, reference: { startsWith: "badge_" } },
      orderBy: { createdAt: "desc" as const },
      take: 15,
      select: {
        id: true, description: true, amount: true, points: true, createdAt: true,
        user: { select: { id: true, name: true, email: true, isBlueVerified: true, verifiedBadgeStyle: true } },
      },
    });
  // groupBy inside a Promise.all tuple loses its row type (Prisma generics);
  // restated here.
  const styleRows = styleRowsRaw as unknown as Array<{ style: string; _count: { _all: number } }>;
  const revenue30 = Math.abs(toNum(sales30._sum.amount)) + Math.abs(sales30._sum.points ?? 0) / rate;
  const styleCount = styleRows.reduce((n, r) => n + r._count._all, 0);

  const stats = [
    { label: "Bought badges (active)", value: bought.toLocaleString(), icon: BadgeCheck, tone: "text-sky-400 bg-sky-500/10" },
    { label: "Granted by admin", value: granted.toLocaleString(), icon: ShieldCheck, tone: "text-emerald-400 bg-emerald-500/10" },
    { label: "Styles in use", value: styleCount.toLocaleString(), icon: Flame, tone: "text-orange-400 bg-orange-500/10" },
    { label: "Sales, last 30 days", value: usd(revenue30), icon: Coins, tone: "text-amber-400 bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <VerifiedBadge style="BLUE_FLAME" size="lg" /> Blue Badges
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Members buy the blue badge monthly and can add animated styles. Badges you grant from a user&apos;s profile are
          permanent and never charged.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <span className={`mb-2 grid h-9 w-9 place-items-center rounded-lg ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="text-2xl font-bold tabular-nums text-white">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {styleRows.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="mb-3 text-sm font-bold text-white">Active styles</p>
          <div className="flex flex-wrap gap-2">
            {styleRows
              .sort((a, b) => b._count._all - a._count._all)
              .map((r) => (
                <span key={r.style} className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-200">
                  <VerifiedBadge style={r.style} size="sm" />
                  {styleLabel(r.style)} · {r._count._all}
                </span>
              ))}
          </div>
        </div>
      )}

      <BadgeConfigEditor canEdit={canEdit} />

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="mb-3 text-sm font-bold text-white">Recent sales</p>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No badge has been bought yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {recent.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-white">
                  <a href={`/admin/users/${t.user.id}`} className="truncate hover:underline">
                    {t.user.name || t.user.email}
                  </a>
                  {t.user.isBlueVerified && <VerifiedBadge style={t.user.verifiedBadgeStyle} size="sm" />}
                </span>
                <span className="text-gray-400">{t.description}</span>
                <span className="tabular-nums text-gray-200">
                  {toNum(t.amount) ? usd(Math.abs(toNum(t.amount))) : `${Math.abs(t.points).toLocaleString()} pts`}
                </span>
                <span className="text-xs text-gray-500">{t.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
