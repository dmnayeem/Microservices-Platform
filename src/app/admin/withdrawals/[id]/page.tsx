import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  User,
  CreditCard,
  Calendar,
  DollarSign,
  AlertTriangle,
  Shield,
  Activity,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { WithdrawalActions } from "./_components/WithdrawalActions";
import { assessWithdrawalRisk } from "@/lib/withdrawal-risk";

interface PageProps {
  params: Promise<{ id: string }>;
}

const statusConfig: Record<string, { color: string; bgColor: string; borderColor: string; icon: typeof Clock }> = {
  PENDING: { color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", icon: Clock },
  PROCESSING: { color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30", icon: Loader2 },
  COMPLETED: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: CheckCircle },
  REJECTED: { color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", icon: XCircle },
  CANCELLED: { color: "text-gray-400", bgColor: "bg-gray-500/10", borderColor: "border-gray-500/30", icon: XCircle },
};

const methodLabels: Record<string, string> = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
};

export default async function WithdrawalDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "withdrawals.view")) {
    redirect("/admin/withdrawals");
  }

  const { id } = await params;

  const withdrawalRaw = await prisma.withdrawal.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          level: true,
          xp: true,
          pointsBalance: true,
          cashBalance: true,
          totalEarnings: true,
          totalWithdrawals: true,
          kycStatus: true,
          package: { select: { slug: true, name: true } },
          createdAt: true,
          country: true,
          _count: {
            select: {
              withdrawals: true,
              taskSubmissions: true,
            },
          },
        },
      },
    },
  });

  if (!withdrawalRaw) {
    notFound();
  }

  // Type assertion for Prisma Accelerate
  type WithdrawalWithUser = typeof withdrawalRaw & {
    user: {
      id: string;
      name: string | null;
      email: string;
      avatar: string | null;
      level: number;
      xp: number;
      pointsBalance: number;
      cashBalance: number;
      totalEarnings: number;
      totalWithdrawals: number;
      kycStatus: string;
      package: { slug: string; name: string } | null;
      createdAt: Date;
      country: string | null;
      _count: {
        withdrawals: number;
        taskSubmissions: number;
      };
    };
  };
  const withdrawal = withdrawalRaw as WithdrawalWithUser;

  // Fetch user's previous withdrawal stats for risk assessment
  const [previousWithdrawals, rejectedCount] = await Promise.all([
    prisma.withdrawal.findMany({
      where: {
        userId: withdrawal.userId,
        id: { not: withdrawal.id },
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.withdrawal.count({
      where: {
        userId: withdrawal.userId,
        id: { not: withdrawal.id },
        status: "REJECTED",
      },
    }),
  ]);

  const config = statusConfig[withdrawal.status] || statusConfig.PENDING;
  const StatusIcon = config.icon;

  const canProcess = hasPermission(adminRole, "withdrawals.process");

  // Parse account details from JSON
  const accountDetails = withdrawal.accountDetails as Record<string, string> | null;

  // Risk assessment using shared helper
  const accountAge = differenceInDays(
    new Date(),
    new Date(withdrawal.user.createdAt)
  );
  const risk = assessWithdrawalRisk({
    amount: toNum(withdrawal.amount),
    userKycStatus: withdrawal.user.kycStatus,
    userPackageTier: withdrawal.user.package?.slug ?? "default",
    accountAgeDays: accountAge,
    previousSuccessfulWithdrawals: previousWithdrawals.length,
    previousRejectedWithdrawals: rejectedCount,
  });
  const riskLevel = risk.level.toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
  const riskColors = {
    LOW: "text-emerald-400 bg-emerald-500/10",
    MEDIUM: "text-amber-400 bg-amber-500/10",
    HIGH: "text-red-400 bg-red-500/10",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/withdrawals"
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Withdrawal Request</h1>
            <p className="text-gray-400 text-sm">ID: {withdrawal.id}</p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
          <StatusIcon className={`w-5 h-5 ${config.color} ${withdrawal.status === "PROCESSING" ? "animate-spin" : ""}`} />
          <span className={`font-medium ${config.color}`}>{withdrawal.status}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Amount Details */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Request Details
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Amount Requested</p>
                <p className="text-2xl font-bold text-white">${withdrawal.amount.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Processing Fee</p>
                <p className="text-2xl font-bold text-amber-400">${withdrawal.fee.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Net Amount</p>
                <p className="text-2xl font-bold text-emerald-400">${withdrawal.netAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-400" />
              Payment Details
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-800">
                <span className="text-gray-400">Payment Method</span>
                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-sm font-medium">
                  {methodLabels[withdrawal.method] || withdrawal.method}
                </span>
              </div>
              {accountDetails && Object.entries(accountDetails).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-400 capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="text-white font-mono">{value}</span>
                </div>
              ))}
              {withdrawal.transactionId && (
                <div className="flex items-center justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-400">Transaction ID</span>
                  <span className="text-white font-mono">{withdrawal.transactionId}</span>
                </div>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-purple-400" />
              User Information
            </h2>
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {withdrawal.user.name?.charAt(0) || withdrawal.user.email.charAt(0)}
              </div>
              <div className="flex-1">
                <Link
                  href={`/admin/users/${withdrawal.user.id}`}
                  className="text-xl font-semibold text-white hover:text-indigo-400 transition-colors"
                >
                  {withdrawal.user.name || "Unnamed User"}
                </Link>
                <p className="text-gray-400">{withdrawal.user.email}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-sm text-gray-500">Level {withdrawal.user.level}</span>
                  <span className="text-gray-600">|</span>
                  <span className="text-sm text-indigo-400">{withdrawal.user.package?.name ?? "—"}</span>
                  <span className="text-gray-600">|</span>
                  <span className={`text-sm ${
                    withdrawal.user.kycStatus === "APPROVED" ? "text-emerald-400" :
                    withdrawal.user.kycStatus === "PENDING" ? "text-amber-400" :
                    "text-gray-400"
                  }`}>KYC: {withdrawal.user.kycStatus}</span>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Balance</p>
                <p className="text-lg font-semibold text-white">${withdrawal.user.cashBalance.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Total Earnings</p>
                <p className="text-lg font-semibold text-emerald-400">${withdrawal.user.totalEarnings.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Total Withdrawn</p>
                <p className="text-lg font-semibold text-amber-400">${withdrawal.user.totalWithdrawals.toFixed(2)}</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Account Age</p>
                <p className="text-lg font-semibold text-white">{accountAge} days</p>
              </div>
            </div>
          </div>

          {/* Previous Withdrawals */}
          {previousWithdrawals.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Previous Withdrawals ({withdrawal.user._count.withdrawals - 1})
              </h2>
              <div className="space-y-3">
                {previousWithdrawals.map((prev) => (
                  <div key={prev.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-white">${prev.amount.toFixed(2)}</span>
                      <span className="text-gray-500 text-sm">via {methodLabels[prev.method] || prev.method}</span>
                    </div>
                    <span className="text-sm text-gray-400">
                      {format(prev.createdAt, "MMM d, yyyy")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Risk Assessment */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              Risk Assessment
            </h2>
            <div className="flex items-center justify-between mb-4">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${riskColors[riskLevel]}`}>
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">{riskLevel} Risk</span>
              </div>
              <span className="text-sm text-slate-400 tabular-nums">
                Score: {risk.score}/100
              </span>
            </div>

            {risk.flags.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs font-bold text-red-300 uppercase tracking-wider mb-1">
                  Flags
                </p>
                <ul className="text-sm text-red-200 space-y-0.5 list-disc list-inside">
                  {risk.flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              {risk.checks.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{c.label}</span>
                  {c.ok ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Tasks Completed</span>
                </div>
                <span className="text-white">{withdrawal.user._count.taskSubmissions}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Timeline
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-indigo-400"></div>
                <div>
                  <p className="text-sm text-white">Request Created</p>
                  <p className="text-xs text-gray-500">
                    {format(withdrawal.createdAt, "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>
              {withdrawal.processedAt && (
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 mt-2 rounded-full ${
                    withdrawal.status === "COMPLETED" ? "bg-emerald-400" :
                    withdrawal.status === "REJECTED" ? "bg-red-400" : "bg-blue-400"
                  }`}></div>
                  <div>
                    <p className="text-sm text-white">
                      {withdrawal.status === "COMPLETED" ? "Completed" :
                       withdrawal.status === "REJECTED" ? "Rejected" : "Processing Started"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(withdrawal.processedAt, "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status-aware Process panel */}
          {canProcess && (
            <WithdrawalActions
              withdrawalId={withdrawal.id}
              status={withdrawal.status}
              amount={toNum(withdrawal.amount)}
              netAmount={toNum(withdrawal.netAmount)}
              method={methodLabels[withdrawal.method] || withdrawal.method}
              existingTransactionId={withdrawal.transactionId ?? null}
            />
          )}

          {/* Rejection Reason */}
          {withdrawal.status === "REJECTED" && withdrawal.rejectionReason && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Rejection Reason
              </h2>
              <p className="text-gray-300">{withdrawal.rejectionReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
