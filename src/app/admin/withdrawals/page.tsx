import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  DollarSign,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { Prisma } from "@/generated/prisma/client";
import { WithdrawalRowActions } from "@/components/admin/withdrawals/withdrawal-row-actions";
import { assessWithdrawalRisk, type RiskLevel } from "@/lib/withdrawal-risk";
import { AdminTable } from "@/components/admin/ui/admin-table";

const RISK_BADGE: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "LOW" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-400", label: "MED" },
  high: { bg: "bg-red-500/15", text: "text-red-400", label: "HIGH" },
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    method?: string;
    search?: string;
  }>;
}

const statusConfig: Record<string, { color: string; bgColor: string; icon: typeof Clock }> = {
  PENDING: { color: "text-amber-400", bgColor: "bg-amber-500/10", icon: Clock },
  PROCESSING: { color: "text-blue-400", bgColor: "bg-blue-500/10", icon: Loader2 },
  COMPLETED: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", icon: CheckCircle },
  REJECTED: { color: "text-red-400", bgColor: "bg-red-500/10", icon: XCircle },
  CANCELLED: { color: "text-gray-400", bgColor: "bg-gray-500/10", icon: XCircle },
};

const methodLabels: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
};

export default async function AdminWithdrawalsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "withdrawals.view")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  // Build where clause based on filters
  const where: Prisma.WithdrawalWhereInput = {};

  if (params.status && params.status !== "all") {
    where.status = params.status as Prisma.EnumWithdrawalStatusFilter["equals"];
  }

  if (params.method && params.method !== "all") {
    where.method = params.method as Prisma.EnumPaymentMethodFilter["equals"];
  }

  if (params.search) {
    where.OR = [
      { user: { email: { contains: params.search, mode: "insensitive" } } },
      { user: { name: { contains: params.search, mode: "insensitive" } } },
      { transactionId: { contains: params.search, mode: "insensitive" } },
    ];
  }

  // Fetch withdrawals and stats
  const [withdrawalsRaw, totalCount, stats] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            level: true,
            kycStatus: true,
            package: { select: { slug: true, name: true } },
            createdAt: true,
          },
        },
      },
    }),
    prisma.withdrawal.count({ where }),
    Promise.all([
      prisma.withdrawal.count({ where: { status: "PENDING" } }),
      prisma.withdrawal.count({ where: { status: "PROCESSING" } }),
      prisma.withdrawal.count({ where: { status: "COMPLETED" } }),
      prisma.withdrawal.count({ where: { status: "REJECTED" } }),
      prisma.withdrawal.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
      }),
      prisma.withdrawal.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
    ]),
  ]);

  const [
    pendingCount,
    processingCount,
    completedCount,
    rejectedCount,
    pendingSum,
    completedSum,
  ] = stats;

  // Type assertion for Prisma Accelerate
  type WithdrawalWithUser = typeof withdrawalsRaw[0] & {
    user: {
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
      level: number;
      kycStatus: string;
      package: { slug: string; name: string } | null;
      createdAt: Date;
    };
  };
  const withdrawals = withdrawalsRaw as WithdrawalWithUser[];

  // Pre-compute per-user history counts for risk scoring (one round-trip)
  const userIds = Array.from(new Set(withdrawals.map((w) => w.userId)));
  const historyByUser = new Map<
    string,
    { successful: number; rejected: number }
  >();
  if (userIds.length > 0) {
    type GroupRow = { userId: string; status: string; _count: { _all: number } };
    const groups = (await prisma.withdrawal.groupBy({
      by: ["userId", "status"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    })) as unknown as GroupRow[];
    for (const g of groups) {
      const cur = historyByUser.get(g.userId) ?? { successful: 0, rejected: 0 };
      if (g.status === "COMPLETED") cur.successful = g._count._all;
      if (g.status === "REJECTED") cur.rejected = g._count._all;
      historyByUser.set(g.userId, cur);
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildQueryString = (newPage: number) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (params.status) queryParams.set("status", params.status);
    if (params.method) queryParams.set("method", params.method);
    if (params.search) queryParams.set("search", params.search);
    return queryParams.toString();
  };

  const canProcess = hasPermission(adminRole, "withdrawals.process");

  const pendingAmount = pendingSum._sum.amount ?? 0;
  const totalPaid = completedSum._sum.amount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Withdrawal Management</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Process and manage user withdrawal requests
          </p>
        </div>

        {/* Total Pending banner — prominent yellow display per spec */}
        <div className="rounded-xl bg-linear-to-r from-yellow-500/15 to-amber-500/10 border border-yellow-500/30 px-5 py-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/20">
            <Clock className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-yellow-300/80">
              Total Pending
            </p>
            <p className="text-2xl font-bold text-yellow-400 tabular-nums">
              ${pendingAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Stats — 4-card row per spec: Pending / Processing / Completed / Rejected */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          href="/admin/withdrawals?status=PENDING"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "PENDING" ? "border-amber-500/50" : "border-slate-800 hover:border-amber-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{pendingCount}</p>
              <p className="text-sm text-slate-500">Pending</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/withdrawals?status=PROCESSING"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "PROCESSING" ? "border-blue-500/50" : "border-slate-800 hover:border-blue-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{processingCount}</p>
              <p className="text-sm text-slate-500">Processing</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/withdrawals?status=COMPLETED"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "COMPLETED" ? "border-emerald-500/50" : "border-slate-800 hover:border-emerald-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{completedCount}</p>
              <p className="text-sm text-slate-500">Completed · ${totalPaid.toFixed(0)}</p>
            </div>
          </div>
        </Link>
        <Link
          href="/admin/withdrawals?status=REJECTED"
          className={`bg-slate-900 rounded-xl border p-4 transition-colors ${
            params.status === "REJECTED" ? "border-red-500/50" : "border-slate-800 hover:border-red-500/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white tabular-nums">{rejectedCount}</p>
              <p className="text-sm text-slate-500">Rejected</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Filters */}
      <form className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="search"
            name="search"
            defaultValue={params.search}
            placeholder="Search by user email, name, or transaction ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            name="status"
            defaultValue={params.status || "all"}
            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-red-500"
          >
            <option value="all">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            name="method"
            defaultValue={params.method || "all"}
            className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-red-500"
          >
            <option value="all">All Methods</option>
            <option value="BKASH">bKash</option>
            <option value="NAGAD">Nagad</option>
            <option value="ROCKET">Rocket</option>
            <option value="BINANCE">Binance</option>
            <option value="PAYPAL">PayPal</option>
          </select>
          <button
            type="submit"
            className="p-2.5 bg-red-500 rounded-lg text-white hover:bg-red-600 transition-colors"
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </form>

      {/* Withdrawals Table */}
      {withdrawals.length > 0 ? (
        (() => {
          const rows = withdrawals.map((withdrawal) => {
            const config = statusConfig[withdrawal.status] || statusConfig.PENDING;
            const history = historyByUser.get(withdrawal.userId) ?? {
              successful: 0,
              rejected: 0,
            };
            const risk = assessWithdrawalRisk({
              amount: toNum(withdrawal.amount),
              userKycStatus: withdrawal.user.kycStatus,
              userPackageTier: withdrawal.user.package?.slug ?? "default",
              accountAgeDays: differenceInDays(new Date(), withdrawal.user.createdAt),
              previousSuccessfulWithdrawals: history.successful,
              previousRejectedWithdrawals: history.rejected,
            });
            return { withdrawal, config, risk };
          });
          return (
            <AdminTable
              rows={rows}
              getRowKey={(r) => r.withdrawal.id}
              columns={[
                {
                  key: "user",
                  header: "User",
                  primary: true,
                  cell: (r) => (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
                        {r.withdrawal.user.name?.charAt(0) || r.withdrawal.user.email.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${r.withdrawal.user.id}`}
                          className="text-white hover:text-indigo-400 font-medium transition-colors truncate block max-w-45"
                        >
                          {r.withdrawal.user.name || "Unnamed"}
                        </Link>
                        <p className="text-xs text-slate-500 truncate max-w-45">
                          {r.withdrawal.user.email}
                        </p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "amount",
                  header: "Amount",
                  cell: (r) => (
                    <div>
                      <p className="text-white font-medium tabular-nums">${r.withdrawal.amount.toFixed(2)}</p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        Fee ${r.withdrawal.fee.toFixed(2)} · Net ${r.withdrawal.netAmount.toFixed(2)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "method",
                  header: "Method",
                  cell: (r) => (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">
                      {methodLabels[r.withdrawal.method] || r.withdrawal.method}
                    </span>
                  ),
                },
                {
                  key: "risk",
                  header: "Risk",
                  cell: (r) => {
                    const riskBadge = RISK_BADGE[r.risk.level];
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${riskBadge.bg} ${riskBadge.text}`}
                        title={r.risk.flags.length ? r.risk.flags.join(" · ") : "No risk flags"}
                      >
                        {riskBadge.label}
                      </span>
                    );
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (r) => {
                    const StatusIcon = r.config.icon;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${r.config.bgColor} ${r.config.color}`}>
                        <StatusIcon className={`w-3 h-3 ${r.withdrawal.status === "PROCESSING" ? "animate-spin" : ""}`} />
                        {r.withdrawal.status}
                      </span>
                    );
                  },
                },
                {
                  key: "requested",
                  header: "Requested",
                  cell: (r) => (
                    <span className="text-sm text-slate-400">
                      {formatDistanceToNow(r.withdrawal.createdAt, { addSuffix: true })}
                    </span>
                  ),
                },
                {
                  key: "kyc",
                  header: "KYC",
                  cell: (r) => (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      r.withdrawal.user.kycStatus === "APPROVED"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : r.withdrawal.user.kycStatus === "PENDING"
                        ? "bg-amber-500/10 text-amber-400"
                        : r.withdrawal.user.kycStatus === "REJECTED"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-slate-500/10 text-slate-400"
                    }`}>
                      {r.withdrawal.user.kycStatus === "NOT_SUBMITTED" ? "No KYC" : r.withdrawal.user.kycStatus}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  cell: (r) => (
                    <WithdrawalRowActions
                      withdrawalId={r.withdrawal.id}
                      status={r.withdrawal.status}
                      amount={toNum(r.withdrawal.amount)}
                      canProcess={canProcess}
                    />
                  ),
                },
              ]}
            />
          );
        })()
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-16 text-center">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-medium text-white mb-2">No withdrawals found</h3>
          <p className="text-gray-400">
            {params.search || params.status || params.method
              ? "Try adjusting your filters"
              : "No withdrawal requests yet"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of {totalCount} withdrawals
          </p>
          <div className="flex gap-2">
            <Link
              href={page > 1 ? `/admin/withdrawals?${buildQueryString(page - 1)}` : "#"}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                page > 1
                  ? "bg-gray-800 text-white hover:bg-gray-700"
                  : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Link>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <Link
                    key={pageNum}
                    href={`/admin/withdrawals?${buildQueryString(pageNum)}`}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      pageNum === page
                        ? "bg-red-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {pageNum}
                  </Link>
                );
              })}
            </div>
            <Link
              href={page < totalPages ? `/admin/withdrawals?${buildQueryString(page + 1)}` : "#"}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                page < totalPages
                  ? "bg-gray-800 text-white hover:bg-gray-700"
                  : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
