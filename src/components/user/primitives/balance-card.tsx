import { cn, pts, usd } from "@/lib/utils";
import { Coins, DollarSign, ArrowUpRight, Megaphone, Plus, Sparkles } from "lucide-react";
import { TASK_CREDIT } from "@/lib/task-credit-theme";
import Link from "next/link";

interface BalanceCardProps {
  points: number;
  cash: number;
  /** Non-withdrawable ad credit (USD). When set, a third tile + top-up action show. */
  adCredit?: number;
  /**
   * Task credit (points bought to fund tasks). When set, a fourth tile shows.
   *
   * The four pots used to be told apart by hue — points amber, cash emerald,
   * ad credit sky, task credit violet — which is four saturated colours inside
   * one card, and the reason a buyer could not tell at a glance which figure
   * was the big one. They are told apart by their LABEL and their icon now,
   * which is what a label is for; the only thing that varies in size here is
   * the total, and it is the total that should.
   */
  taskCredit?: number;
  packageTier?: string;
  withdrawHref?: string;
  /** Where "Add funds" points (deposits). When set, an Add-funds action shows. */
  addFundsHref?: string;
  /** Where the ad-credit "Top up" points (advertiser page). */
  adTopUpHref?: string;
  className?: string;
  compact?: boolean;
  /** Admin-configurable points-per-$1 rate (default 1000). */
  /** Points per USD (admin setting). Required — a default here silently
   *  mis-values every balance when the rate changes. */
  pointsPerUsd: number;
}

export function BalanceCard({
  points,
  cash,
  adCredit,
  taskCredit,
  packageTier,
  withdrawHref = "/withdrawal",
  addFundsHref,
  adTopUpHref = "/advertiser",
  className,
  compact = false,
  pointsPerUsd,
}: BalanceCardProps) {
  const ptInUsd = points / pointsPerUsd;
  const showAdCredit = adCredit !== undefined;
  const showTaskCredit = taskCredit !== undefined && taskCredit > 0;
  return (
    /* The one thing on a money screen that should be unmistakable.
       It was a translucent indigo wash over a card, with the total at 24px and
       four sub-tiles whose labels were amber, emerald, violet and sky — so the
       total, the points, the cash, the credit and the tier badge were five
       roughly-equal claims on the eye, four of them in different colours.

       Now: the panel IS the gradient, the total is `t-hero` (up to 48px,
       weight 800, tabular) and everything else on it is white at 11-14px. The
       ratio between the total and its own label is about 4:1, which is what
       makes it the answer to "what do I see first" rather than the brightest
       thing winning. The sub-tiles keep their icons and lose their hues. */
    <div
      className={cn(
        "app-panel app-accent app-accent-glow relative overflow-hidden",
        className
      )}
    >
      {/* Depth on the gradient itself rather than coloured blobs behind it. */}
      <div
        aria-hidden
        className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/12 blur-3xl pointer-events-none"
      />

      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="t-eyebrow text-white/90">Total Balance</p>
          <p className="t-hero mt-1.5 whitespace-nowrap text-white">
            {usd(cash + ptInUsd)}
          </p>
          <p className="t-meta mt-1.5 text-white/90">Cash + points value</p>
        </div>
        {packageTier && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-white/20 border border-white/40 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
            {packageTier}
          </span>
        )}
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-(--app-r-control) bg-black/20 border border-white/25 p-3">
          <div className="flex items-center gap-1.5 text-white/90 mb-1">
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span className="t-eyebrow">Points</span>
          </div>
          <p className="t-figure-sm whitespace-nowrap text-white">{pts(points)}</p>
          <p className="t-meta text-white/90">{usd(ptInUsd)}</p>
        </div>
        <div className="min-w-0 rounded-(--app-r-control) bg-black/20 border border-white/25 p-3">
          <div className="flex items-center gap-1.5 text-white/90 mb-1">
            <DollarSign className="w-3.5 h-3.5 shrink-0" />
            <span className="t-eyebrow">Cash</span>
          </div>
          <p className="t-figure-sm whitespace-nowrap text-white">{usd(cash)}</p>
          <p className="t-meta text-white/90">Withdrawable</p>
        </div>

        {showTaskCredit && (
          <div className="col-span-2 rounded-(--app-r-control) bg-black/20 border border-white/25 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1 text-white/90">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="t-eyebrow">{TASK_CREDIT.label}</span>
              </div>
              <p className="t-figure-sm whitespace-nowrap text-white">
                {pts(taskCredit)}
              </p>
              <p className="t-meta text-white/90 truncate">{TASK_CREDIT.blurb}</p>
            </div>
            <Link
              href="/buy-points"
              className="app-press app-tap-row shrink-0 inline-flex items-center gap-1 px-3.5 rounded-(--app-r-chip) bg-white/20 border border-white/40 text-white text-xs font-extrabold hover:bg-white/30"
            >
              <Plus className="w-3.5 h-3.5" /> Buy
            </Link>
          </div>
        )}

        {showAdCredit && (
          <div className="col-span-2 rounded-(--app-r-control) bg-black/20 border border-white/25 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-white/90 mb-1">
                <Megaphone className="w-3.5 h-3.5 shrink-0" />
                <span className="t-eyebrow">Ad Credit</span>
              </div>
              <p className="t-figure-sm whitespace-nowrap text-white">
                {usd(adCredit)}
              </p>
              <p className="t-meta text-white/90 truncate">
                Funds ad campaigns · non-withdrawable
              </p>
            </div>
            <Link
              href={adTopUpHref}
              className="app-press app-tap-row shrink-0 inline-flex items-center gap-1 px-3.5 rounded-(--app-r-chip) bg-white/20 border border-white/40 text-white text-xs font-extrabold hover:bg-white/30"
            >
              <Plus className="w-3.5 h-3.5" /> Top up
            </Link>
          </div>
        )}
      </div>

      {/* Withdraw is the primary action, so on a gradient panel it is the solid
          WHITE button — the strongest contrast available here (up to 5.7:1 the
          other way). A second gradient button on a gradient panel would be
          invisible, which is what the old "from-indigo-600" button did. */}
      {!compact && (
        <div
          className={cn(
            "relative mt-4 grid gap-2",
            addFundsHref ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          {addFundsHref && (
            <Link
              href={addFundsHref}
              className="app-press app-tap-row inline-flex items-center justify-center gap-1.5 rounded-(--app-r-control) bg-white/15 border border-white/40 text-white text-sm font-extrabold hover:bg-white/25"
            >
              <Plus className="w-4 h-4" /> Add funds
            </Link>
          )}
          <Link
            href={withdrawHref}
            className="app-press app-tap-row inline-flex items-center justify-center gap-1.5 rounded-(--app-r-control) app-on-white bg-white text-sm font-extrabold hover:bg-white/90"
          >
            Withdraw <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
