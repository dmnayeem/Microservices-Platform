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
import { KycPromptBanner } from "@/components/user/primitives/kyc-prompt-banner";

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
        // AUTO_APPROVED counts too — quiz, video and every autoApprove task
        // credits with that status, so counting "APPROVED" alone showed 0 to
        // users who had genuinely completed work.
        where: {
          userId: session.user.id,
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
      }),
      prisma.user.count({
        where: { referredById: session.user.id },
      }),
      // Same visibility rules as /tasks. This used to be a bare
      // `{ status: "ACTIVE" }`, so the preview could link a user straight to a
      // task that /api/tasks/[id]/start refuses (hidden, expired, wrong plan,
      // or outside their audience).
      getVisibleTaskPreview(session.user.id, 6),
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
          reference: true,
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
  // Use the SAME threshold table the server writes User.level from
  // (src/lib/user-rank.ts). The old `level * 100` divided CUMULATIVE xp by a
  // per-level figure, so every user past level 2 sat permanently at 100% and
  // disagreed with /profile and the Earn hub for the same account.
  const { xpProgress, xpNeeded, xpPercentage } = levelProgress(level, xp);

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
        <h1 className="t-title text-white">
          Welcome back, {user.name?.split(" ")[0] || "User"}!
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
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
            value={xpProgress}
            sub={`/${xpNeeded}`}
            unit="XP"
            hint={`${xpPercentage}% to next level`}
            icon={<Zap className="w-5 h-5" />}
            tone="purple"
          />
        </div>
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
          <span className="t-meta font-extrabold text-(--app-info) shrink-0">
            Convert →
          </span>
        </Link>
      )}

      {/* Quick actions — compact chips (no cramped 2-up on phones) */}
      <div>
        <p className="t-eyebrow text-(--app-ink-3) mb-2.5 px-1">Quick Access</p>
        <div className="grid grid-cols-4 gap-2">
          {[
            ...QUICK_ACTIONS,
            ...(isAdvertiser
              ? [{ label: "Run Ads", href: "/advertiser", icon: Megaphone }]
              : []),
          ].map((qa) => (
            <Link
              key={qa.label}
              href={qa.href}
              className="group app-card app-press app-lift flex flex-col items-center justify-center gap-2 p-3"
            >
              <div className="app-icon">
                <qa.icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-(--app-ink-2) group-hover:text-white text-center leading-tight">
                {qa.label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Explore the platform — surfaces every earning + spending surface */}
      <div>
        <p className="t-eyebrow text-(--app-ink-3) mb-2.5 px-1">Explore</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {EXPLORE.map((e) => (
            <Link
              key={e.label}
              href={e.href}
              className="group app-card app-press app-lift app-tap-row flex items-center gap-2 p-2.5"
            >
              <e.icon className="w-4 h-4 shrink-0 text-(--app-ink-3)" />
              <span className="text-[11px] font-bold text-(--app-ink-2) group-hover:text-white truncate min-w-0">
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
      <section className="app-card">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="t-section text-white">Recent Activity</h2>
          <Link
            href="/wallet"
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-info) hover:bg-(--app-info-soft)"
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
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-info) hover:bg-(--app-info-soft)"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
  );
}
