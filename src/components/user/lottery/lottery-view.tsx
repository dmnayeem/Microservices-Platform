"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ticket,
  Trophy,
  Clock,
  Coins,
  Loader2,
  Sparkles,
  Crown,
} from "lucide-react";
import { notifyCenter } from "@/lib/notify-center";
import { format } from "date-fns";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { runInterstitial } from "@/lib/reward-interstitial";

interface Prize {
  position: number;
  amount: number;
  count?: number;
}

interface LotteryItem {
  id: string;
  title: string;
  description?: string | null;
  drawDate: string;
  ticketPrice: number;
  ticketsSold: number;
  maxTickets?: number | null;
  maxTicketsPerUser: number;
  status: "UPCOMING" | "ACTIVE" | "DRAWING" | "COMPLETED" | "CANCELLED" | string;
  prizes: Prize[];
  totalPrizePool: number;
  userTickets: { count: number; tickets: string[] };
  canBuyTicket: boolean;
  timeUntilDraw: number;
  // ── Pool mode + shortfall policy ─────────────────────────────────────────
  prizeMode?: "FIXED" | "POOL";
  prizeTiers?: { position: number; percent: number; description: string }[];
  /** What the pot can never fall below (guaranteed pot + anything rolled in). */
  guaranteedFloor?: number;
  minTickets?: number;
  shortfallAction?: "DRAW" | "REFUND" | "ROLLOVER";
  rolloverTargetTitle?: string | null;
}

/**
 * The one sentence a player must see BEFORE paying.
 *
 * Under ROLLOVER their money is not returned if the draw falls short. Finding
 * that out afterwards is the difference between a rule and a scam.
 */
function shortfallNotice(l: LotteryItem): string | null {
  const min = l.minTickets ?? 0;
  if (min <= 0) return null;

  const prefix =
    l.ticketsSold < min
      ? `Only ${l.ticketsSold.toLocaleString()} of ${min.toLocaleString()} tickets sold so far.`
      : `Needs at least ${min.toLocaleString()} tickets.`;

  if (l.shortfallAction === "REFUND") {
    return `${prefix} If it doesn't get there by the draw, everyone is refunded in full.`;
  }
  if (l.shortfallAction === "ROLLOVER") {
    const where = l.rolloverTargetTitle
      ? `"${l.rolloverTargetTitle}"`
      : "the next draw";
    return `${prefix} If it doesn't get there, the pot moves to ${where} — tickets are NOT refunded.`;
  }
  return `${prefix} It will be drawn either way; the prize just gets smaller.`;
}

interface RecentWinner {
  userName: string;
  userAvatar?: string | null;
  lotteryTitle: string;
  prizeAmount: number | null;
  ticketNumber: string;
}

const BUNDLES = [
  { qty: 1, label: "Buy 1" },
  { qty: 5, label: "Buy 5" },
  { qty: 10, label: "Buy 10" },
];

export function LotteryView() {
  const [lotteries, setLotteries] = useState<LotteryItem[]>([]);
  const [recentWinners, setRecentWinners] = useState<RecentWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/lottery");
      const d = await res.json();
      setLotteries(d.lotteries ?? []);
      setRecentWinners(d.recentWinners ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const buy = async (lotteryId: string, quantity: number) => {
    setBusyId(`${lotteryId}-${quantity}`);
    try {
      const res = await fetch("/api/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ lotteryId, quantity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      notifyCenter.success(
        `Purchased ${quantity} ticket${quantity > 1 ? "s" : ""}!`,
        "Good luck in the draw 🍀"
      );
      void load();
    } catch (err) {
      notifyCenter.error(
        "Couldn't buy ticket",
        err instanceof Error ? err.message : "Try again"
      );
    } finally {
      setBusyId(null);
    }
  };

  const featuredLottery = lotteries[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Ticket className="w-6 h-6 text-purple-400" />
          Lottery
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Try your luck — every ticket counts.
        </p>
      </header>

      {loading && <ListSkeleton rows={3} />}

      {!loading && featuredLottery && (
        <FeaturedLotteryCard
          lottery={featuredLottery}
          onBuy={buy}
          busyId={busyId}
        />
      )}

      {!loading && lotteries.length > 1 && (
        <section>
          <h2 className="text-sm font-bold text-white mb-2">Other Draws</h2>
          <div className="space-y-2">
            {lotteries.slice(1).map((l) => (
              <LotteryRow
                key={l.id}
                lottery={l}
                onBuy={buy}
                busyId={busyId}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && lotteries.length === 0 && (
        <EmptyState
          icon={Ticket}
          title="No active lotteries"
          description="Check back soon for the next draw."
        />
      )}

      {/* My tickets summary */}
      {!loading && lotteries.some((l) => l.userTickets.count > 0) && (
        <section>
          <h2 className="text-sm font-bold text-white mb-2">My Tickets</h2>
          <div className="space-y-2">
            {lotteries
              .filter((l) => l.userTickets.count > 0)
              .map((l) => (
                <div
                  key={l.id}
                  className="glass rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {l.title}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {l.userTickets.count} ticket
                      {l.userTickets.count > 1 ? "s" : ""} ·{" "}
                      {l.status === "COMPLETED"
                        ? "Drawn"
                        : `Draws ${format(new Date(l.drawDate), "MMM d")}`}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Past winners */}
      {!loading && recentWinners.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-white mb-2 inline-flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Recent Winners
          </h2>
          <div className="space-y-1.5">
            {recentWinners.slice(0, 5).map((w, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 flex items-center gap-3"
              >
                <span className="text-lg">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🎟"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {w.userName}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {w.lotteryTitle} · #{w.ticketNumber}
                  </p>
                </div>
                {typeof w.prizeAmount === "number" && (
                  <span className="text-sm font-bold text-amber-400 tabular-nums">
                    +{w.prizeAmount.toLocaleString()} pts
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured lottery card with countdown + bundle buttons
// ─────────────────────────────────────────────────────────────────────────────

function FeaturedLotteryCard({
  lottery,
  onBuy,
  busyId,
}: {
  lottery: LotteryItem;
  onBuy: (id: string, qty: number) => void;
  busyId: string | null;
}) {
  const countdown = useCountdown(lottery.drawDate);
  const topPrize = lottery.prizes[0]?.amount ?? lottery.totalPrizePool;
  const isActive = lottery.status === "ACTIVE";

  return (
    <div className="rounded-2xl bg-linear-to-br from-purple-600/30 via-pink-500/20 to-amber-400/20 border border-purple-500/40 backdrop-blur-xl p-5 shadow-2xl">
      <div className="flex items-center gap-2 text-purple-200">
        <Crown className="w-5 h-5 text-amber-300" />
        <p className="text-xs uppercase tracking-widest font-bold">
          {lottery.title}
        </p>
      </div>

      <p className="mt-2 text-4xl sm:text-5xl font-extrabold text-white tabular-nums inline-flex items-center gap-2">
        <Coins className="w-9 h-9 text-amber-300 shrink-0" />
        {topPrize.toLocaleString()}
        <span className="text-base font-bold ml-1 text-purple-200/80">pts</span>
      </p>
      <p className="text-sm text-purple-200/80 mt-1">
        {lottery.prizeMode === "POOL" ? (
          <>
            Top prize right now · the pot grows with every ticket
            {(lottery.guaranteedFloor ?? 0) > 0 && (
              <>
                {" "}
                · at least {(lottery.guaranteedFloor ?? 0).toLocaleString()} pts
                guaranteed
              </>
            )}
          </>
        ) : (
          <>Top prize · Total pool {lottery.totalPrizePool.toLocaleString()} pts</>
        )}
      </p>

      {/* Stated before purchase, not after. */}
      {shortfallNotice(lottery) && (
        <p className="mt-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
          {shortfallNotice(lottery)}
        </p>
      )}

      {/* Countdown */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {(
          [
            { label: "Days", value: countdown.days },
            { label: "Hours", value: countdown.hours },
            { label: "Min", value: countdown.minutes },
            { label: "Sec", value: countdown.seconds },
          ] as const
        ).map((unit) => (
          <div
            key={unit.label}
            className="rounded-lg bg-white/10 border border-white/20 p-2 text-center backdrop-blur-xl"
          >
            <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">
              {String(unit.value).padStart(2, "0")}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-purple-200/80 font-bold">
              {unit.label}
            </p>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center justify-between text-xs text-purple-200/80">
        <span className="inline-flex items-center gap-1">
          <Ticket className="w-3.5 h-3.5" />
          {lottery.ticketsSold.toLocaleString()} sold
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {format(new Date(lottery.drawDate), "MMM d, h:mm a")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Coins className="w-3.5 h-3.5" />
          {lottery.ticketPrice} pts/ticket
        </span>
      </div>

      {/* Bundle buttons */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {BUNDLES.map((b) => {
          const cost = b.qty * lottery.ticketPrice;
          // Apply small discount for 5 / 10 packs
          const discount = b.qty === 5 ? 0.9 : b.qty === 10 ? 0.8 : 1;
          const finalCost = Math.round(cost * discount);
          const busyKey = `${lottery.id}-${b.qty}`;
          return (
            <button
              key={b.qty}
              onClick={() => onBuy(lottery.id, b.qty)}
              disabled={!isActive || !lottery.canBuyTicket || busyId === busyKey}
              className={cn(
                "rounded-xl px-3 py-3 text-center transition-all border-2",
                isActive && lottery.canBuyTicket
                  ? "bg-white/10 hover:bg-white/15 border-white/30 hover:scale-105 text-white"
                  : "bg-white/5 border-white/10 text-white/50 cursor-not-allowed"
              )}
            >
              {busyId === busyKey ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <>
                  <p className="text-sm font-bold">{b.label}</p>
                  <p className="text-base font-extrabold mt-0.5 tabular-nums">
                    {finalCost} pts
                  </p>
                  {discount < 1 && (
                    <p className="text-[10px] text-amber-300 font-bold">
                      -{((1 - discount) * 100).toFixed(0)}% off
                    </p>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {!isActive && (
        <p className="mt-3 text-center text-xs text-purple-200/80">
          {lottery.status === "UPCOMING"
            ? "Sales open soon."
            : lottery.status === "DRAWING"
              ? "Drawing in progress…"
              : lottery.status === "COMPLETED"
                ? "This draw has ended."
                : "Closed."}
        </p>
      )}

      {lottery.userTickets.count > 0 && (
        <div className="mt-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          You have {lottery.userTickets.count} ticket
          {lottery.userTickets.count > 1 ? "s" : ""} in this draw — good luck!
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact row for additional lotteries
// ─────────────────────────────────────────────────────────────────────────────

function LotteryRow({
  lottery,
  onBuy,
  busyId,
}: {
  lottery: LotteryItem;
  onBuy: (id: string, qty: number) => void;
  busyId: string | null;
}) {
  const isActive = lottery.status === "ACTIVE" && lottery.canBuyTicket;
  return (
    <div className="glass rounded-xl p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-linear-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
        <Ticket className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{lottery.title}</p>
        <p className="text-[11px] text-gray-500">
          {lottery.totalPrizePool.toLocaleString()} pts pool
          {lottery.prizeMode === "POOL" && " (growing)"} ·{" "}
          {format(new Date(lottery.drawDate), "MMM d")}
        </p>
        {/* Same disclosure as the hero card — a player who only ever sees the
            compact row must still know the rollover rule before buying. */}
        {shortfallNotice(lottery) && (
          <p className="text-[11px] text-amber-300/90 truncate">
            {shortfallNotice(lottery)}
          </p>
        )}
      </div>
      <button
        onClick={() => onBuy(lottery.id, 1)}
        disabled={!isActive || busyId === `${lottery.id}-1`}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap",
          isActive
            ? "bg-purple-500 hover:bg-purple-600 text-white"
            : "bg-gray-800 text-gray-500 cursor-not-allowed"
        )}
      >
        {busyId === `${lottery.id}-1` ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isActive ? (
          `${lottery.ticketPrice} pts`
        ) : (
          lottery.status
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Countdown hook
// ─────────────────────────────────────────────────────────────────────────────

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function useCountdown(target: string | Date): CountdownParts {
  const targetMs = useMemo(
    () => new Date(target).getTime(),
    [target]
  );

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, targetMs - now);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff / (60 * 60 * 1000)) % 24);
  const minutes = Math.floor((diff / (60 * 1000)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return {
    days,
    hours,
    minutes,
    seconds,
    expired: diff === 0,
  };
}
