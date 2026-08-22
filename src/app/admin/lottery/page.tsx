import { parsePage } from "@/lib/paginate";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Ticket, Plus, Calendar, DollarSign, Users, Trophy, ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, Play } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { type UserRole } from "@/lib/rbac";
import { roleCanViewLottery, roleCanManageLottery } from "@/lib/lottery-access";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
  }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  UPCOMING: { label: "Upcoming", color: "text-blue-400 bg-blue-500/10", icon: Clock },
  ACTIVE: { label: "Active", color: "text-emerald-400 bg-emerald-500/10", icon: Play },
  COMPLETED: { label: "Completed", color: "text-purple-400 bg-purple-500/10", icon: CheckCircle },
  CANCELLED: { label: "Cancelled", color: "text-red-400 bg-red-500/10", icon: XCircle },
};

export default async function AdminLotteryPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  // Check for any relevant permission
  if (!roleCanViewLottery(adminRole)) {
    redirect("/admin");
  }

  const params = await searchParams;
  const page = parsePage(params.page);
  const pageSize = 10;
  const skip = (page - 1) * pageSize;
  const statusFilter = params.status || "";

  // Build where clause
  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.status = statusFilter;
  }

  // Fetch lotteries with pagination
  const [lotteries, totalCount] = await Promise.all([
    prisma.lottery.findMany({
      where,
      orderBy: { drawDate: "desc" },
      take: pageSize,
      skip,
      include: {
        _count: {
          select: { tickets: true },
        },
      },
    }),
    prisma.lottery.count({ where }),
  ]);

  // Type assertion for Prisma Accelerate
  type LotteryWithCount = (typeof lotteries)[0] & {
    _count: { tickets: number };
  };
  const typedLotteries = lotteries as LotteryWithCount[];

  // Get stats
  const [totalLotteries, activeLotteries, totalTicketsSold, _totalPrizePool] = await Promise.all([
    prisma.lottery.count(),
    prisma.lottery.count({ where: { status: "ACTIVE" } }),
    prisma.lotteryTicket.count(),
    prisma.lottery.aggregate({
      where: { status: { in: ["ACTIVE", "UPCOMING"] } },
      _sum: { ticketsSold: true },
    }),
  ]);

  // Get ticket value (estimate from active lotteries)
  const activeLotteryPrices = await prisma.lottery.findMany({
    where: { status: { in: ["ACTIVE", "UPCOMING"] } },
    select: { ticketPrice: true, _count: { select: { tickets: true } } },
  });
  const estimatedPoolValue = (
    activeLotteryPrices as unknown as {
      ticketPrice: number;
      _count: { tickets: number };
    }[]
  ).reduce((sum, l) => sum + l.ticketPrice * l._count.tickets, 0);

  const totalPages = Math.ceil(totalCount / pageSize);
  const canCreate = roleCanManageLottery(adminRole);

  const buildQueryString = (newPage: number, newStatus?: string) => {
    const queryParams = new URLSearchParams();
    queryParams.set("page", newPage.toString());
    if (newStatus !== undefined) {
      if (newStatus) queryParams.set("status", newStatus);
    } else if (statusFilter) {
      queryParams.set("status", statusFilter);
    }
    return queryParams.toString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lottery Management</h1>
          <p className="text-gray-400 mt-1">
            Create and manage lottery draws
          </p>
        </div>
        {canCreate && (
          <Link
            href="/admin/lottery/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Lottery
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Ticket className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalLotteries}</p>
              <p className="text-sm text-gray-500">Total Lotteries</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Play className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeLotteries}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalTicketsSold.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Tickets Sold</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{estimatedPoolValue.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Points in Pool</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/lottery"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
            !statusFilter
              ? "bg-indigo-500 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          All
        </Link>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <Link
            key={status}
            href={`/admin/lottery?${buildQueryString(1, status)}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === status
                ? "bg-indigo-500 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {config.label}
          </Link>
        ))}
      </div>

      {/* Lotteries List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {typedLotteries.length > 0 ? (
          <div className="divide-y divide-gray-800">
            {typedLotteries.map((lottery) => {
              const statusConfig = STATUS_CONFIG[lottery.status] || STATUS_CONFIG.UPCOMING;
              const StatusIcon = statusConfig.icon;
              const prizes = lottery.prizes as { position: number; amount: number }[];

              return (
                <div
                  key={lottery.id}
                  className="p-6 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-white text-lg">{lottery.title}</h3>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {statusConfig.label}
                        </span>
                      </div>
                      {lottery.description && (
                        <p className="text-sm text-gray-500 mb-3">{lottery.description}</p>
                      )}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <Calendar className="w-4 h-4" />
                          Draw: {format(new Date(lottery.drawDate), "MMM d, yyyy h:mm a")}
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <Ticket className="w-4 h-4" />
                          {/* Live count — the purchase cap is enforced against
                              a live count too, so the denormalized
                              `ticketsSold` could show a different number here
                              than the user's page. */}
                          {lottery._count.tickets} / {lottery.maxTickets || "∞"} tickets
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <DollarSign className="w-4 h-4" />
                          {lottery.ticketPrice} pts/ticket
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Prize Pool */}
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Total Prizes</p>
                        <p className="text-lg font-bold text-amber-400">
                          {Array.isArray(prizes)
                            ? prizes.reduce((sum, p) => sum + p.amount, 0).toLocaleString()
                            : 0}{" "}
                          pts
                        </p>
                      </div>

                      <Link
                        href={`/admin/lottery/${lottery.id}`}
                        className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Manage
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-16 text-center">
            <Ticket className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-medium text-white mb-2">No lotteries found</h3>
            <p className="text-gray-400 mb-4">
              {statusFilter
                ? "No lotteries match your filter"
                : "Create your first lottery to get started"}
            </p>
            {canCreate && (
              <Link
                href="/admin/lottery/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Lottery
              </Link>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="p-4 border-t border-gray-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {skip + 1} - {Math.min(skip + pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/admin/lottery?${buildQueryString(page - 1)}` : "#"}
                className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  page > 1
                    ? "bg-gray-800 text-white hover:bg-gray-700"
                    : "bg-gray-800/50 text-gray-600 cursor-not-allowed"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Link>
              <Link
                href={
                  page < totalPages
                    ? `/admin/lottery?${buildQueryString(page + 1)}`
                    : "#"
                }
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
    </div>
  );
}
