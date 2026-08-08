import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  CheckCircle,
  Users,
  Star,
  Gift,
  Trophy,
  Flame,
  Zap,
  ListTodo,
  Plus,
  Megaphone,
  ShoppingBag,
  GraduationCap,
  Gamepad2,
  Compass,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import {
  AdRenderer,
  type AdResponse,
} from "@/components/user/primitives/ad-renderer";
import { serveAd } from "@/lib/ad-serve";
import { StatCard } from "@/components/user/primitives/stat-card";
import { BalanceCard } from "@/components/user/primitives/balance-card";
import {
  TransactionRow,
  type TxType,
  type TxStatus,
} from "@/components/user/primitives/transaction-row";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { taskRunHref } from "@/lib/task-routes";
import { toNum } from "@/lib/money";
import { getPointsPerUsd, getPointsConvertThreshold } from "@/lib/economy";
import { getEffectiveFeatures } from "@/lib/packages";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { ProfileCompletionBanner } from "@/components/user/primitives/profile-completion-banner";
import { getKycPromptState } from "@/lib/kyc-prompt-server";
import { KycPromptBanner } from "@/components/user/primitives/kyc-prompt-banner";

// Map the DB transaction type → the TransactionRow visual type.
function toTxType(t: string): TxType {
  switch (t) {
    case "REFERRAL":
      return "EARN_REFERRAL";
    case "LOTTERY_WIN":
      return "EARN_LOTTERY";
    case "BONUS":
    case "CHECKIN":
    case "GIFT":
      return "EARN_BONUS";
    case "WITHDRAWAL":
      return "WITHDRAWAL";
    case "PURCHASE":
    case "COURSE_PURCHASE":
    case "DEPOSIT":
      return "PURCHASE";
    case "REFUND":
    case "COURSE_REFUND":
      return "REFUND";
    case "EARNING":
    case "COURSE_TUTOR_EARNING":
      return "EARN_TASK";
    default:
      return "EARN_OTHER";
  }
}

const QUICK_ACTIONS = [
  { label: "Tasks", href: "/tasks", icon: CheckCircle, tone: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20" },
  { label: "Add funds", href: "/deposit", icon: Plus, tone: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" },
  { label: "Invite", href: "/referrals", icon: Users, tone: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy, tone: "bg-pink-500/10 text-pink-400 ring-1 ring-pink-500/20" },
];

// Discovery strip — surfaces the platform's earning + spending surfaces so the
// dashboard reflects everything now available (not just tasks).
const EXPLORE = [
  { label: "Offerwalls", href: "/offerwalls", icon: Compass, tone: "text-cyan-400" },
  { label: "Daily Bonus", href: "/earn", icon: Gift, tone: "text-emerald-400" },
  { label: "Marketplace", href: "/marketplace", icon: ShoppingBag, tone: "text-fuchsia-400" },
  { label: "Courses", href: "/courses", icon: GraduationCap, tone: "text-sky-400" },
  { label: "Games", href: "/games", icon: Gamepad2, tone: "text-violet-400" },
  { label: "Lottery", href: "/lottery", icon: Trophy, tone: "text-amber-400" },
];

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Fetch everything in ONE batch — none of these depend on each other, so they
  // run as a single parallel round-trip instead of two serial phases.
  const [
    userData,
    tasksCompleted,
    referralsCount,
    availableTasks,
    recentTx,
    pointsPerUsd,
    gate,
    kycPrompt,
    dashAd,
    features,
    convertThreshold,
  ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          pointsBalance: true,
          cashBalance: true,
          adCreditBalance: true,
          xp: true,
          level: true,
          streak: true,
          referralCode: true,
        },
      }),
      prisma.taskSubmission.count({
        where: { userId: session.user.id, status: "APPROVED" },
      }),
      prisma.user.count({
        where: { referredById: session.user.id },
      }),
      prisma.task.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          type: true,
          pointsReward: true,
          xpReward: true,
          difficulty: true,
        },
        // Shared, slow-changing list — serve from Accelerate cache to cut
        // dashboard render time.
        cacheStrategy: { ttl: 60, swr: 120 },
      }),
      prisma.transaction.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          type: true,
          status: true,
          points: true,
          amount: true,
          description: true,
          createdAt: true,
        },
      }),
      getPointsPerUsd(),
      getProfileGateState(session.user.id),
      getKycPromptState(session.user.id),
      // SSR the dashboard banner so it's in the initial HTML (ad-blocker can't hide
      // markup that's already there). AdRenderer paints this, then rotates client-side.
      serveAd({ placement: "DASHBOARD", userId: session.user.id }),
      getEffectiveFeatures(session.user.id),
      getPointsConvertThreshold(),
    ]);

  const user = session.user;
  const points = userData?.pointsBalance ?? 0;
  const cash = toNum(userData?.cashBalance ?? 0);
  const adCredit = toNum(userData?.adCreditBalance ?? 0);
  const isAdvertiser = features.enabled.has("advertiser");
  const canConvertPoints = points >= convertThreshold;
  const xp = userData?.xp ?? 0;
  const level = userData?.level ?? 1;
  const streak = userData?.streak ?? 0;
  const xpForNextLevel = level * 100; // Simple formula: level * 100 XP needed
  const xpProgress = Math.min((xp / xpForNextLevel) * 100, 100);

  return (
    <div className="space-y-6">
      {/* One nudge at a time — profile completion takes priority over KYC. */}
      {gate.locked ? (
        <ProfileCompletionBanner
          done={gate.progress.done}
          total={gate.progress.total}
          percentage={gate.progress.percentage}
        />
      ) : kycPrompt.show ? (
        <KycPromptBanner />
      ) : null}

      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-white">
          Welcome back, {user.name?.split(" ")[0] || "User"}!
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Here&apos;s what&apos;s happening with your earnings today.
        </p>
      </div>

      {/* Balance hero + stat strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BalanceCard
          points={points}
          cash={cash}
          adCredit={isAdvertiser ? adCredit : undefined}
          pointsPerUsd={pointsPerUsd}
          addFundsHref="/deposit"
          withdrawHref="/wallet"
          className="lg:col-span-1"
        />
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <StatCard
            label="Tasks Completed"
            value={tasksCompleted}
            icon={<CheckCircle className="w-5 h-5" />}
            tone="green"
          />
          <StatCard
            label="Referrals"
            value={referralsCount}
            icon={<Users className="w-5 h-5" />}
            tone="amber"
          />
          <StatCard
            label="Day Streak"
            value={streak}
            hint={streak > 0 ? "Keep it up!" : "Check in daily"}
            icon={<Flame className="w-5 h-5" />}
            tone="pink"
          />
          <StatCard
            label={`Level ${level}`}
            value={`${xp}/${xpForNextLevel} XP`}
            hint={`${Math.round(xpProgress)}% to next level`}
            icon={<Zap className="w-5 h-5" />}
            tone="purple"
          />
        </div>
      </div>

      {/* Convert-points nudge — points become withdrawable cash at the threshold */}
      {canConvertPoints && (
        <Link
          href="/wallet"
          className="flex items-center gap-3 rounded-xl border border-sky-500/25 bg-linear-to-r from-sky-500/10 to-indigo-500/5 p-3 hover:border-sky-500/40 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-sky-500/15 grid place-items-center text-sky-300 shrink-0">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Convert points to cash</p>
            <p className="text-xs text-gray-400">
              You have enough points to convert into withdrawable cash.
            </p>
          </div>
          <span className="text-xs font-bold text-sky-300 shrink-0">Convert →</span>
        </Link>
      )}

      {/* Quick actions — compact chips (no cramped 2-up on phones) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
          Quick Access
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[
            ...QUICK_ACTIONS,
            ...(isAdvertiser
              ? [{ label: "Run Ads", href: "/advertiser", icon: Megaphone, tone: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20" }]
              : []),
          ].map((qa) => (
            <Link
              key={qa.label}
              href={qa.href}
              className="group card card-interactive flex flex-col items-center justify-center gap-1.5 p-3"
            >
              <div className={`w-10 h-10 rounded-xl grid place-items-center ${qa.tone}`}>
                <qa.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-gray-300 group-hover:text-white text-center leading-tight">
                {qa.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Explore the platform — surfaces every earning + spending surface */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">
          Explore
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {EXPLORE.map((e) => (
            <Link
              key={e.label}
              href={e.href}
              className="group card card-interactive flex items-center gap-2 p-2.5"
            >
              <e.icon className={`w-4 h-4 shrink-0 ${e.tone}`} />
              <span className="text-[11px] font-medium text-gray-300 group-hover:text-white truncate">
                {e.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <AdRenderer
        placement="DASHBOARD"
        initialAd={dashAd.ad as AdResponse | null}
        initialRotateMs={dashAd.rotateMs}
      />

      {/* Recent activity (real last-5 transactions) */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Recent Activity</h2>
          <Link href="/wallet" className="text-sm text-indigo-400 hover:text-indigo-300">
            View all
          </Link>
        </div>
        {recentTx.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No activity yet"
            description="Complete tasks to start earning!"
            action={{ label: "Browse tasks", href: "/tasks" }}
          />
        ) : (
          <div>
            {recentTx.map((tx) => {
              const usePoints = tx.points !== 0;
              return (
                <TransactionRow
                  key={tx.id}
                  type={toTxType(tx.type)}
                  description={tx.description ?? tx.type.replace(/_/g, " ")}
                  amount={usePoints ? tx.points : toNum(tx.amount)}
                  unit={usePoints ? "pts" : "USD"}
                  status={tx.status as TxStatus}
                  date={tx.createdAt}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Available tasks preview */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">Available Tasks</h2>
          <Link href="/tasks" className="text-sm text-indigo-400 hover:text-indigo-300">
            View all
          </Link>
        </div>
        {availableTasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks available right now"
            description="Check back soon for new earning opportunities!"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableTasks.map((t) => (
              <Link
                key={t.id}
                href={taskRunHref(t.type, t.id)}
                className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 p-3 hover:border-indigo-500/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">
                    {t.title}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {t.type.toLowerCase()}
                    {t.difficulty ? ` · ${t.difficulty.toLowerCase()}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-amber-400 tabular-nums">
                    +{t.pointsReward.toLocaleString()}
                  </p>
                  {t.xpReward > 0 && (
                    <p className="text-xs text-gray-500">+{t.xpReward} XP</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
