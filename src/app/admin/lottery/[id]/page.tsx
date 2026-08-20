import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  Ticket,
  Calendar,
  DollarSign,
  Users,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  Play,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { LotteryActions } from "./_components/LotteryActions";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  UPCOMING: { label: "Upcoming", color: "text-blue-400 bg-blue-500/10", icon: Clock },
  ACTIVE: { label: "Active", color: "text-emerald-400 bg-emerald-500/10", icon: Play },
  COMPLETED: { label: "Completed", color: "text-purple-400 bg-purple-500/10", icon: CheckCircle },
  CANCELLED: { label: "Cancelled", color: "text-red-400 bg-red-500/10", icon: XCircle },
};

export default async function LotteryDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "settings.view")) {
    redirect("/admin");
  }

  const { id } = await params;

  const lottery = await prisma.lottery.findUnique({
    where: { id },
    include: {
      tickets: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!lottery) {
    notFound();
  }

  // Type assertion for Prisma Accelerate
  type LotteryWithTickets = typeof lottery & {
    tickets: Array<{
      id: string;
      ticketNumber: string;
      isWinner: boolean;
      prizeAmount: number | null;
      createdAt: Date;
      user: { id: string; name: string | null; email: string };
    }>;
  };
  const typedLottery = lottery as LotteryWithTickets & {
    _count: { tickets: number };
  };
  // Live ticket count — the same source the purchase cap and the user-facing
  // lottery page use, so the two screens can't disagree.
  const ticketsSold = typedLottery._count.tickets;

  const statusConfig = STATUS_CONFIG[typedLottery.status] || STATUS_CONFIG.UPCOMING;
  const StatusIcon = statusConfig.icon;
  const prizes = typedLottery.prizes as { position: number; amount: number; description: string }[];
  const totalPrizePool = Array.isArray(prizes) ? prizes.reduce((sum, p) => sum + p.amount, 0) : 0;
  const winners = (typedLottery.winners as { position: number; ticketId: string; userId: string }[]) || [];

  const canManage = hasPermission(adminRole, "settings.edit");

  // Distinct buyers across ALL tickets — deriving this from the 50-row preview
  // above capped it at 50 while "Tickets Sold" beside it showed the true total.
  const uniqueParticipants = (
    await prisma.lotteryTicket.findMany({
      where: { lotteryId: id },
      select: { userId: true },
      distinct: ["userId"],
    })
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/lottery"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{typedLottery.title}</h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
          </div>
          {typedLottery.description && (
            <p className="text-gray-400 mt-1">{typedLottery.description}</p>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <Ticket className="w-5 h-5 text-indigo-400 mb-2" />
              <p className="text-2xl font-bold text-white">{ticketsSold}</p>
              <p className="text-xs text-gray-500">Tickets Sold</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <Users className="w-5 h-5 text-purple-400 mb-2" />
              <p className="text-2xl font-bold text-white">{uniqueParticipants}</p>
              <p className="text-xs text-gray-500">Participants</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <DollarSign className="w-5 h-5 text-emerald-400 mb-2" />
              <p className="text-2xl font-bold text-white">
                {(ticketsSold * typedLottery.ticketPrice).toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Points Collected</p>
            </div>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <Trophy className="w-5 h-5 text-amber-400 mb-2" />
              <p className="text-2xl font-bold text-white">{totalPrizePool.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Prize Pool</p>
            </div>
          </div>

          {/* Prizes */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Prize Structure
            </h2>
            <div className="space-y-3">
              {Array.isArray(prizes) && prizes.map((prize, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-amber-500/10 rounded-lg">
                      <span className="font-bold text-amber-400">#{prize.position}</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">{prize.description}</p>
                      <p className="text-xs text-gray-500">Position {prize.position}</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-amber-400">
                    {prize.amount.toLocaleString()} pts
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Winners (if completed) */}
          {typedLottery.status === "COMPLETED" && winners.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                Winners
              </h2>
              <div className="space-y-3">
                {typedLottery.tickets
                  .filter((t) => t.isWinner)
                  .map((ticket) => (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-linear-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-medium">
                          {ticket.user.name?.charAt(0) || ticket.user.email.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/admin/users/${ticket.user.id}`}
                            className="font-medium text-white hover:text-emerald-400"
                          >
                            {ticket.user.name || ticket.user.email}
                          </Link>
                          <p className="text-xs text-gray-500">
                            Ticket: {ticket.ticketNumber}
                          </p>
                        </div>
                      </div>
                      {ticket.prizeAmount && (
                        <p className="text-lg font-bold text-emerald-400">
                          {ticket.prizeAmount.toLocaleString()} pts
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Recent Tickets */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Recent Tickets ({typedLottery.tickets.length})
            </h2>
            {typedLottery.tickets.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {typedLottery.tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <code className="px-2 py-1 bg-gray-700 rounded text-xs text-indigo-400">
                        {ticket.ticketNumber}
                      </code>
                      <Link
                        href={`/admin/users/${ticket.user.id}`}
                        className="text-sm text-white hover:text-indigo-400"
                      >
                        {ticket.user.name || ticket.user.email}
                      </Link>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(ticket.createdAt))} ago
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No tickets sold yet</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Schedule */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Schedule</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Calendar className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Start Date</p>
                  <p className="text-sm text-white">
                    {format(new Date(typedLottery.startDate), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Calendar className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">End Date</p>
                  <p className="text-sm text-white">
                    {format(new Date(typedLottery.endDate), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-800 rounded-lg">
                  <Trophy className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Draw Date</p>
                  <p className="text-sm text-white">
                    {format(new Date(typedLottery.drawDate), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Settings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Ticket Settings</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="text-white">{typedLottery.ticketPrice} pts</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Tickets</span>
                <span className="text-white">{typedLottery.maxTickets || "Unlimited"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Per User Limit</span>
                <span className="text-white">{typedLottery.maxTicketsPerUser}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <LotteryActions
              lotteryId={typedLottery.id}
              status={typedLottery.status}
              ticketsSold={ticketsSold}
            />
          )}
        </div>
      </div>
    </div>
  );
}
