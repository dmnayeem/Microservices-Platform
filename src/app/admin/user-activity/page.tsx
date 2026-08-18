import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { toNum } from "@/lib/money";
import { format } from "date-fns";
import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight, Users, Coins, TrendingUp } from "lucide-react";
import { AdminTable } from "@/components/admin/ui/admin-table";
import { ActivityFilterBar } from "@/components/admin/activity/activity-filter-bar";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    action?: string; // transaction type
    q?: string;
    days?: string;
  }>;
}

const TX_TYPES = [
  "EARNING", "WITHDRAWAL", "BONUS", "REFERRAL", "PURCHASE", "REFUND",
  "PENALTY", "GIFT", "LOTTERY_WIN", "CHECKIN", "DEPOSIT",
  "AFFILIATE_COMMISSION", "POINTS_CONVERSION", "COURSE_PURCHASE",
];

function typeTone(t: string): string {
  const a = t.toUpperCase();
  if (/(EARNING|BONUS|REFERRAL|GIFT|LOTTERY_WIN|CHECKIN|DEPOSIT|COMMISSION)/.test(a))
    return "text-emerald-400 bg-emerald-500/10";
  if (/(WITHDRAWAL|PURCHASE|PENALTY|FEE)/.test(a))
    return "text-red-400 bg-red-500/10";
  if (/(REFUND|CONVERSION)/.test(a)) return "text-blue-400 bg-blue-500/10";
  return "text-gray-300 bg-gray-500/10";
}

export default async function UserActivityPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "users.view"))) redirect("/admin");

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;
  const typeFilter = params.action || "";
  const q = (params.q || "").trim();
  const days = params.days ? parseInt(params.days) : 0;

  let userIds: string[] | null = null;
  if (q) {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { id: q },
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    userIds = matches.map((m) => m.id);
    if (userIds.length === 0) userIds = ["__none__"];
  }

  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const where: Record<string, unknown> = {};
  if (typeFilter) where.type = typeFilter;
  if (userIds) where.userId = { in: userIds };
  if (since) where.createdAt = { gte: since };

  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [txns, totalCount, events24h, events7d, activeToday] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      select: {
        id: true, userId: true, type: true, status: true,
        points: true, amount: true, description: true, createdAt: true,
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.transaction.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.transaction.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startOfToday } },
    }) as unknown as Promise<{ userId: string }[]>,
  ]);

  // Resolve user display for the visible rows.
  const rowUserIds = [...new Set(txns.map((t) => t.userId))];
  const users = rowUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: rowUserIds } },
        select: { id: true, name: true, email: true, avatar: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildQuery = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("page", String(p));
    if (typeFilter) sp.set("action", typeFilter);
    if (q) sp.set("q", q);
    if (params.days) sp.set("days", params.days);
    return sp.toString();
  };

  const stats = [
    { label: "Events (24h)", value: events24h.toLocaleString(), icon: Activity, tone: "text-indigo-400 bg-indigo-500/10" },
    { label: "Events (7d)", value: events7d.toLocaleString(), icon: TrendingUp, tone: "text-blue-400 bg-blue-500/10" },
    { label: "Active users today", value: activeToday.length.toLocaleString(), icon: Users, tone: "text-emerald-400 bg-emerald-500/10" },
    { label: "In current filter", value: totalCount.toLocaleString(), icon: Coins, tone: "text-amber-400 bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-400 grid place-items-center">
          <Activity className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">User Activity</h1>
          <p className="text-sm text-gray-400">
            Every user&apos;s earning, spending and wallet movement in one feed. Open a user for their full timeline.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.tone.split(" ")[1]}`}>
                <s.icon className={`w-5 h-5 ${s.tone.split(" ")[0]}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-white truncate">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <ActivityFilterBar
        basePath="/admin/user-activity"
        actions={TX_TYPES}
        current={{ action: typeFilter, q, days: params.days }}
        searchLabel="Search user (name / email / id)"
      />

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {txns.length > 0 ? (
          <AdminTable
            bare
            rows={txns}
            getRowKey={(t) => t.id}
            columns={[
              {
                key: "when",
                header: "When",
                cell: (t) => (
                  <div>
                    <p className="text-sm text-white">{format(new Date(t.createdAt), "MMM d")}</p>
                    <p className="text-xs text-gray-500">{format(new Date(t.createdAt), "h:mm a")}</p>
                  </div>
                ),
              },
              {
                key: "user",
                header: "User",
                cell: (t) => {
                  const u = userMap.get(t.userId);
                  return u ? (
                    <Link href={`/admin/users/${u.id}?tab=activity`} className="text-sm text-white hover:text-indigo-400">
                      {u.name || u.email}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-500">{t.userId.slice(0, 8)}…</span>
                  );
                },
              },
              {
                key: "type",
                header: "Type",
                primary: true,
                cell: (t) => (
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${typeTone(t.type)}`}>
                    {t.type}
                  </span>
                ),
              },
              {
                key: "amount",
                header: "Amount",
                mobileHidden: true,
                cell: (t) => {
                  const pts = t.points || 0;
                  const cash = toNum(t.amount as never);
                  return (
                    <div className="text-sm tabular-nums">
                      {pts !== 0 && (
                        <span className={pts > 0 ? "text-emerald-400" : "text-red-400"}>
                          {pts > 0 ? "+" : ""}{pts.toLocaleString()} pts
                        </span>
                      )}
                      {cash !== 0 && (
                        <span className={`block ${cash > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {cash > 0 ? "+" : ""}${Math.abs(cash).toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "desc",
                header: "Details",
                mobileHidden: true,
                cell: (t) => (
                  <p className="text-sm text-gray-400 max-w-xs truncate">{t.description || "—"}</p>
                ),
              },
            ]}
          />
        ) : (
          <div className="p-16 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No activity</h3>
            <p className="text-gray-400">Try adjusting the filters.</p>
          </div>
        )}

        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1}–{Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/user-activity?${buildQuery(page - 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${page > 1 ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-800/50 text-gray-600 cursor-not-allowed"}`}
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Link>
              <Link
                href={page < totalPages ? `/admin/user-activity?${buildQuery(page + 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${page < totalPages ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-800/50 text-gray-600 cursor-not-allowed"}`}
              >
                Next <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
