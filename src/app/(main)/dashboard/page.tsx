import { auth } from "@/lib/auth";
import { LocationBanners } from "@/components/user/primitives/location-banners";
import { ledgerForUser } from "@/lib/ledger-display";
import { redirect } from "next/navigation";
import { prisma, safeRead } from "@/lib/prisma";
import {
  CheckCircle,
  Users,
  TrendingUp,
  ArrowUpRight,
  Hourglass,
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
import { Suspense } from "react";
import {
  AdRenderer,
  type AdResponse,
} from "@/components/user/primitives/ad-renderer";
import { serveAd } from "@/lib/ad-serve";
import { StatCard } from "@/components/user/primitives/stat-card";
import { BalanceCard } from "@/components/user/primitives/balance-card";
import {
  TransactionRow,
  type TxStatus,
} from "@/components/user/primitives/transaction-row";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { taskRunHref } from "@/lib/task-routes";
import { toNum } from "@/lib/money";
import { levelProgress } from "@/lib/level";
import { getVisibleTaskPreview } from "@/lib/task-visibility";
import { deriveSource } from "@/lib/tx-sources";
import { getPointsPerUsd, getPointsConvertThreshold } from "@/lib/economy";
import { getEffectiveFeatures } from "@/lib/packages";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { ProfileCompletionBanner } from "@/components/user/primitives/profile-completion-banner";
import { getKycPromptState } from "@/lib/kyc-prompt-server";
import { breakdownEarnings, resolveRange, summarizeEarnings } from "@/lib/dashboard-earnings";
import { EarningsBreakdownCard } from "@/components/user/dashboard/earnings-breakdown";
import {
  TaskStatusCard,
  WithdrawalsCard,
  ProfileTeamCard,
  NotificationsCard,
} from "@/components/user/dashboard/at-a-glance";
import { getTaskViewerContext, visibleTaskWhere } from "@/lib/task-visibility";
import { getWithdrawalConfig } from "@/lib/withdrawal";
import { calculateProfileCompletion } from "@/lib/profile-completion";
import { usd } from "@/lib/utils";
import { KycPromptBanner } from "@/components/user/primitives/kyc-prompt-banner";
import { PwaRewardCard } from "@/components/pwa/pwa-reward-card";
import { OpenWithdrawalCard } from "@/components/user/wallet/open-withdrawal-card";
import { getPwaRewardConfig, pwaRewardStatus } from "@/lib/pwa-install";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { isPathHidden, taskTypePage } from "@/lib/page-visibility";

/* Four shortcuts, previously indigo / emerald / amber / pink, above six more
   in cyan / emerald / fuchsia / sky / violet / amber. Ten shortcuts, nine
   hues, sitting under a balance card that was itself tinted indigo — this one
   screen carried most of the complaint on its own. Neutral. */
const QUICK_ACTIONS = [
  { label: "Tasks", href: "/tasks", icon: CheckCircle },
  { label: "Add funds", href: "/deposit", icon: Plus },
  { label: "Invite", href: "/referrals", icon: Users },
  { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
];

// Discovery strip — surfaces the platform's earning + spending surfaces so the
// dashboard reflects everything now available (not just tasks).
const EXPLORE = [
  { label: "Offerwalls", href: "/offerwalls", icon: Compass },
  { label: "Daily Bonus", href: "/earn", icon: Gift },
  { label: "Marketplace", href: "/marketplace", icon: ShoppingBag },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Games", href: "/games", icon: Gamepad2 },
  { label: "Lottery", href: "/lottery", icon: Trophy },
];

/** Active tasks this member may see — the same `visibleTaskWhere` as /tasks. */
async function countAvailableTasks(userId: string): Promise<number | null> {
  const ctx = await getTaskViewerContext(userId);
  if (!ctx) return null;
  if (!ctx.hasTasksFeature) return 0;
  return prisma.task.count({
    where: visibleTaskWhere(ctx.viewer, {
      accessLevel: ctx.accessLevel,
      allowedTypes: ctx.allowedTypes,
    }),
  });
}

/** Sent and waiting for review — the reward each would pay if approved. */
async function submittedRewardPoints(userId: string): Promise<number[]> {
  const rows = await prisma.taskSubmission.findMany({
    where: { userId, status: "PENDING", submittedAt: { not: null } },
    select: { task: { select: { pointsReward: true } } },
    take: 1000,
  });
  // The Accelerate-extended client drops relation types from `select` (the
  // same cast as api/admin/analytics/export).
  return (rows as unknown as Array<{ task: { pointsReward: number } | null }>).map(
    (r) => r.task?.pointsReward ?? 0
  );
}

/** The member's three latest rejections, with the reviewer's reason. */
async function latestRejectionsOf(
  userId: string
): Promise<Array<{ id: string; title: string; reason: string | null; at: Date }>> {
  const rows = await prisma.taskSubmission.findMany({
    where: { userId, status: "REJECTED" },
    orderBy: [{ reviewedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 3,
    select: {
      id: true,
      rejectionReason: true,
      reviewedAt: true,
      updatedAt: true,
      task: { select: { title: true } },
    },
  });
  type Row = (typeof rows)[number] & { task: { title: string } | null };
  return (rows as Row[]).map((r) => ({
    id: r.id,
    title: r.task?.title ?? "Task",
    reason: r.rejectionReason,
    at: r.reviewedAt ?? r.updatedAt,
  }));
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Fetch everything in ONE batch — none of these depend on each other, so they
  // run as a single parallel round-trip instead of two serial phases.
  //
  // The balance row and the pending-withdrawal sum stay STRICT: a confidently
  // wrong money figure is worse than an error. Everything else is a card the
  // page can render without, so a single failing read degrades that card
  // (safeRead) instead of taking the whole dashboard to the error screen. The
  // settings-backed reads (economy, gate, KYC prompt, PWA, features) already
  // fall back internally.
  const [
    userData,
    submissionsByStatus,
    referralsCount,
    availableTasksRaw,
    ledgerRaw,
    pendingWithdrawals,
    pointsPerUsd,
    gate,
    kycPrompt,
    features,
    convertThreshold,
    hiddenPaths,
    pwaCfg,
    inProgressCount,
    submittedRewards,
    latestRejections,
    recentWithdrawals,
    withdrawalCfg,
    notifications,
    availableCount,
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
          // App install bonus card — read here so the card needs no request.
          status: true,
          role: true,
          pwaDays: true,
          pwaFirstSeenAt: true,
          pwaRewardedAt: true,
          // At a glance: lifetime totals (USD, as the wallet shows them).
          totalEarnings: true,
          totalWithdrawals: true,
          // Profile completion — the same snapshot /api/profile feeds
          // calculateProfileCompletion, so the dashboard and the ring agree.
          avatar: true,
          coverPhoto: true,
          firstName: true,
          lastName: true,
          bio: true,
          gender: true,
          dateOfBirth: true,
          nidNumber: true,
          emailVerified: true,
          phone: true,
          phoneVerified: true,
          country: true,
          city: true,
          street: true,
          postalCode: true,
          kycStatus: true,
          tags: true,
          _count: { select: { socialAccounts: true } },
        },
      }),
      // One groupBy instead of a count: approved (AUTO_APPROVED too — quiz,
      // video and every autoApprove task credits with that status), in review
      // and rejected all come from the same query.
      safeRead(
        prisma.taskSubmission.groupBy({
          by: ["status"],
          where: { userId: session.user.id },
          _count: { _all: true },
        }),
        [],
        "dashboard submissions"
      ),
      safeRead(
        prisma.user.count({
          where: { referredById: session.user.id },
        }),
        0,
        "dashboard referrals"
      ),
      // Same visibility rules as /tasks. This used to be a bare
      // `{ status: "ACTIVE" }`, so the preview could link a user straight to a
      // task that /api/tasks/[id]/start refuses (hidden, expired, wrong plan,
      // or outside their audience).
      safeRead(getVisibleTaskPreview(session.user.id, 6), [], "dashboard task preview"),
      // The last 30 days of the ledger, read ONCE: the earnings summary (today,
      // 7 and 30 days, the chart, the sources) and the recent-activity list
      // below are all computed from this one query. `metadata` stays selected:
      // ledgerForUser reads `metadata.adjustedPoints` to show corrected rows.
      safeRead(prisma.transaction.findMany({
        // eslint-disable-next-line react-hooks/purity -- async Server Component: runs once per request, never hydrated.
        where: { userId: session.user.id, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          id: true,
          type: true,
          status: true,
          points: true,
          amount: true,
          reference: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }), [], "dashboard ledger"),
      prisma.withdrawal.aggregate({
        where: { userId: session.user.id, status: { in: ["PENDING", "PROCESSING"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      getPointsPerUsd(),
      getProfileGateState(session.user.id),
      getKycPromptState(session.user.id),
      getEffectiveFeatures(session.user.id),
      getPointsConvertThreshold(),
      // Request-cached: the (main) layout already resolved it.
      getHiddenPaths(session.user.id),
      // Settings reads are cached — no database query.
      getPwaRewardConfig(),
      // Opened but not sent: PENDING with no submittedAt (how /api/tasks/social
      // and the admin queue tell the two apart).
      safeRead(
        prisma.taskSubmission.count({
          where: { userId: session.user.id, status: "PENDING", submittedAt: null },
        }),
        0,
        "dashboard in-progress"
      ),
      // Sent and waiting for review — the reward each would pay if approved.
      safeRead(submittedRewardPoints(session.user.id), [], "dashboard submitted rewards"),
      safeRead(latestRejectionsOf(session.user.id), [], "dashboard rejections"),
      safeRead(
        prisma.withdrawal.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: {
            id: true,
            amount: true,
            status: true,
            method: true,
            createdAt: true,
            rejectionReason: true,
          },
        }),
        [],
        "dashboard withdrawals"
      ),
      safeRead(getWithdrawalConfig(session.user.id), null, "dashboard withdrawal config"),
      safeRead(
        prisma.notification.findMany({
          where: { userId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: { id: true, title: true, message: true, createdAt: true, isRead: true },
        }),
        [],
        "dashboard notifications"
      ),
      safeRead(countAvailableTasks(session.user.id), null, "dashboard available count"),
    ]);

  // Super-admin page visibility: a shortcut to a hidden page is a side door.
  const shows = (path: string) => !isPathHidden(path, hiddenPaths);
  const availableTasks = availableTasksRaw.filter((t) => {
    const page = taskTypePage(t.type);
    return !page || shows(page);
  });

  const user = session.user;
  const subCount = (...st: string[]) =>
    (submissionsByStatus as unknown as Array<{ status: string; _count: { _all: number } }>)
      .filter((g) => st.includes(g.status))
      .reduce((a, g) => a + g._count._all, 0);
  const tasksCompleted = subCount("APPROVED", "AUTO_APPROVED");
  // Corrections folded into the rows they correct (lib/ledger-display.ts).
  const ledger30 = ledgerForUser(ledgerRaw);
  const recentTx = ledger30.slice(0, 5);
  const pendingW = pendingWithdrawals as unknown as {
    _count: { _all: number };
    _sum: { amount: unknown };
  };
  const earnings = summarizeEarnings(ledger30);
  // First paint of "Earnings by source" (30 days) from the ledger already read;
  // other ranges come from /api/me/earnings. The read is capped at 1000 rows.
  const initialBreakdown = breakdownEarnings(
    ledger30,
    resolveRange("30d", null, null)!,
    ledgerRaw.length >= 1000
  );
  const awaitingPoints = submittedRewards.reduce((a, p) => a + p, 0);
  const pendingCount = subCount("PENDING");
  const profile = userData
    ? calculateProfileCompletion({
        ...userData,
        socialAccountsCount: userData._count.socialAccounts,
      })
    : null;
  const points = userData?.pointsBalance ?? 0;
  const cash = toNum(userData?.cashBalance ?? 0);
  const adCredit = toNum(userData?.adCreditBalance ?? 0);
  const isAdvertiser = features.enabled.has("advertiser");
  const canConvertPoints = points >= convertThreshold;
  const xp = userData?.xp ?? 0;
  const level = userData?.level ?? 1;
  const streak = userData?.streak ?? 0;
  // Use the SAME threshold table the server writes User.level from
  // (src/lib/user-rank.ts). The old `level * 100` divided CUMULATIVE xp by a
  // per-level figure, so every user past level 2 sat permanently at 100% and
  // disagreed with /profile and the Earn hub for the same account.
  const { xpProgress, xpNeeded, xpPercentage } = levelProgress(level, xp);

  return (
    <div className="space-y-6">
      <LocationBanners userId={session.user.id} location="DASHBOARD" className="" />
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
        <h1 className="t-title text-white">
          Welcome back, {user.name?.split(" ")[0] || "User"}!
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Here&apos;s what&apos;s happening with your earnings today.
        </p>
      </div>

      {/* App install bonus — renders nothing unless the reward is on and unpaid. */}
      <PwaRewardCard status={userData ? pwaRewardStatus(pwaCfg, userData) : null} />

      {/* A withdrawal on its way: where it is, step by step. */}
      <Suspense fallback={null}>
        <OpenWithdrawalCard userId={session.user.id} />
      </Suspense>

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
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Total earned"
            value={usd(toNum(userData?.totalEarnings ?? 0))}
            hint="Lifetime"
            icon={<TrendingUp className="w-5 h-5" />}
            tone="green"
          />
          <StatCard
            label="Total withdrawn"
            value={usd(toNum(userData?.totalWithdrawals ?? 0))}
            hint="Lifetime"
            icon={<ArrowUpRight className="w-5 h-5" />}
            tone="purple"
          />
          <StatCard
            label="Pending earnings"
            value={awaitingPoints.toLocaleString("en-US")}
            unit="pts"
            hint={`${Math.max(0, pendingCount - inProgressCount).toLocaleString("en-US")} in review · paid if approved`}
            icon={<Hourglass className="w-5 h-5" />}
            tone="amber"
          />
          <StatCard
            label="Earned today"
            value={earnings.today.toLocaleString("en-US")}
            unit="pts"
            hint={`${earnings.week.toLocaleString("en-US")} pts in 7 days`}
            icon={<Star className="w-5 h-5" />}
            tone="blue"
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
            value={xpProgress}
            sub={`/${xpNeeded}`}
            unit="XP"
            hint={`${xpPercentage}% to next level`}
            icon={<Zap className="w-5 h-5" />}
            tone="purple"
          />
        </div>
      </div>

      {/* Earnings by source + where the work stands */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-2">
          <EarningsBreakdownCard initial={initialBreakdown} pointsPerUsd={pointsPerUsd} />
        </div>
        <TaskStatusCard
          pointsPerUsd={pointsPerUsd}
          t={{
            available: availableCount,
            inProgress: inProgressCount,
            submitted: Math.max(0, pendingCount - inProgressCount),
            needsChanges: subCount("REVISION_REQUESTED"),
            approved: tasksCompleted,
            rejected: subCount("REJECTED"),
            awaitingPoints,
            rejections: latestRejections,
          }}
        />
      </div>

      {/* Withdrawals, profile + team, notifications */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:items-start">
        {withdrawalCfg && (
          <WithdrawalsCard
            w={{
              cash,
              min: withdrawalCfg.min,
              enabled: withdrawalCfg.enabled,
              subscriptionRequired: withdrawalCfg.subscriptionRequired,
              payoutMessage: withdrawalCfg.payoutMessage,
              open: {
                count: pendingW._count._all,
                amount: toNum(pendingW._sum.amount as Parameters<typeof toNum>[0]),
              },
              recent: recentWithdrawals.map((w) => ({
                id: w.id,
                amount: toNum(w.amount),
                status: w.status,
                method: w.method,
                createdAt: w.createdAt,
                rejectionReason: w.rejectionReason,
              })),
            }}
          />
        )}
        <ProfileTeamCard
          profile={{
            percentage: profile?.percentage ?? 0,
            missing: profile?.missing ?? [],
          }}
          team={{ referrals: referralsCount, teamPoints30: earnings.teamPoints }}
        />
        <NotificationsCard items={notifications} />
      </div>

      {/* Convert-points nudge — points become withdrawable cash at the threshold */}
      {canConvertPoints && (
        <Link
          href="/wallet"
          className="app-card app-press app-lift flex items-center gap-3"
        >
          <div className="app-icon">
            <ArrowRightLeft className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-card-title text-white">Convert points to cash</p>
            <p className="t-meta text-(--app-ink-3) mt-0.5">
              You have enough points to convert into withdrawable cash.
            </p>
          </div>
          <span className="t-meta font-extrabold text-(--app-accent-ink) shrink-0">
            Convert →
          </span>
        </Link>
      )}

      {/* Quick actions — compact chips (no cramped 2-up on phones) */}
      <div>
        <p className="t-eyebrow text-(--app-ink-3) mb-2.5 px-1">Quick Access</p>
        <div className="grid grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2 lg:gap-3">
          {[
            ...QUICK_ACTIONS,
            ...(isAdvertiser
              ? [{ label: "Run Ads", href: "/advertiser", icon: Megaphone }]
              : []),
          ]
            .filter((qa) => shows(qa.href))
            .map((qa) => (
            <Link
              key={qa.label}
              href={qa.href}
              className="group app-card app-press app-lift flex flex-col items-center justify-center gap-2 p-3 lg:flex-row lg:justify-start lg:gap-3 lg:p-3.5"
            >
              <div className="app-icon">
                <qa.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] lg:text-sm font-bold text-(--app-ink-2) group-hover:text-(--app-ink) text-center lg:text-left leading-tight">
                {qa.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Explore the platform — surfaces every earning + spending surface */}
      <div>
        <p className="t-eyebrow text-(--app-ink-3) mb-2.5 px-1">Explore</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 lg:gap-3">
          {EXPLORE.filter((e) => shows(e.href)).map((e) => (
            <Link
              key={e.label}
              href={e.href}
              className="group app-card app-press app-lift app-tap-row flex items-center gap-2 p-2.5 lg:gap-2.5 lg:p-3"
            >
              <e.icon className="w-4 h-4 shrink-0 text-(--app-ink-3)" />
              <span className="text-[11px] lg:text-[13px] font-bold text-(--app-ink-2) group-hover:text-(--app-ink) truncate min-w-0">
                {e.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Streamed on its own so a slow ad serve never holds up the dashboard. */}
      <Suspense fallback={null}>
        <DashboardAd userId={session.user.id} />
      </Suspense>

      {/* Desktop (xl): Recent Activity and Available Tasks side by side —
          stacked, each was a 1,100px-wide card holding a short list. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
      {/* Recent activity (real last-5 transactions) */}
      <section className="app-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="t-section text-white">Recent Activity</h2>
          <Link
            href="/wallet"
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
          >
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
              const isOutflow =
                tx.type === "WITHDRAWAL" ||
                tx.type === "PURCHASE" ||
                tx.type === "PENALTY" ||
                tx.type === "AD_CREDIT_PURCHASE";
              const usePoints = tx.points !== 0;
              const magnitude = usePoints
                ? Math.abs(tx.points)
                : Math.abs(toNum(tx.amount));
              return (
                <TransactionRow
                  key={tx.id}
                  source={deriveSource(tx.type, tx.reference)}
                  description={tx.description ?? tx.type.replace(/_/g, " ")}
                  amount={isOutflow ? -magnitude : magnitude}
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
      <section className="app-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="t-section text-white">Available Tasks</h2>
          <Link
            href="/tasks"
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
          >
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            {availableTasks.map((t) => (
              <Link
                key={t.id}
                href={taskRunHref(t.type, t.id)}
                className="app-tile app-press app-lift flex items-center gap-3 group"
              >
                <div className="app-icon">
                  <Star className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="t-card-title text-white truncate">{t.title}</p>
                  <p className="t-meta text-(--app-ink-3) capitalize mt-0.5">
                    {t.type.toLowerCase()}
                    {t.difficulty ? ` · ${t.difficulty.toLowerCase()}` : ""}
                  </p>
                </div>
                {/* The reward, not the icon, is why anyone reads this row — so
                    it is the biggest thing in it. It was 14px amber against a
                    14px white title and a 20px indigo star. */}
                <div className="text-right shrink-0">
                  <p className="t-figure-sm text-white">
                    +{t.pointsReward.toLocaleString()}
                  </p>
                  {t.xpReward > 0 && (
                    <p className="t-meta text-(--app-ink-3)">+{t.xpReward} XP</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

/**
 * SSR the dashboard banner so it's in the initial HTML (an ad-blocker can't hide
 * markup that's already there). AdRenderer paints this, then rotates
 * client-side. A failed serve falls back to AdRenderer's own client fetch.
 */
async function DashboardAd({ userId }: { userId: string }) {
  const dashAd = await serveAd({ placement: "DASHBOARD", userId }).catch((e) => {
    console.error("[dashboard] serveAd failed:", e);
    return null;
  });
  // The serve answered "nothing eligible": render nothing. Handing AdRenderer a
  // null initialAd made it ask the same question again from the browser.
  if (dashAd && !dashAd.ad) return null;
  return (
    <AdRenderer
      placement="DASHBOARD"
      initialAd={(dashAd?.ad ?? null) as AdResponse | null}
      // Same rule as ServerAdSlot: a one-ad pool has nothing to rotate to, and
      // a timer there re-requested the same creative every 10s.
      initialRotateMs={dashAd && dashAd.poolSize > 1 ? dashAd.rotateMs : 0}
    />
  );
}
