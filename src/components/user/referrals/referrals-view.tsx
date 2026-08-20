"use client";
import { STAT_VALUE_CLASS } from "@/components/user/primitives/stat-card";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Copy,
  Share2,
  QrCode,
  Download,
  CheckCircle,
  TrendingUp,
  Coins,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { notifyCenter } from "@/lib/notify-center";
import { newIdempotencyKey } from "@/lib/idempotency-key";
// `qrcode` is loaded lazily (only when the QR panel renders) so it stays out of
// the initial referrals-page chunk — see QrPanel below.
import { format } from "date-fns";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { Avatar } from "@/components/user/primitives/avatar";
import { cn, usd } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

export interface ReferralUser {
  id: string;
  name: string | null;
  avatar: string | null;
  level: 1 | 2 | 3;
  joinedAt: string;
  earnings: number;
  isActive: boolean;
}

export interface ReferralsViewProps {
  referralCode: string;
  shareUrl: string;
  l1Count: number;
  l2Count: number;
  l3Count: number;
  l1Earned: number;
  l2Earned: number;
  l3Earned: number;
  thisMonthEarned: number;
  team: ReferralUser[];
}

const HASHTAGS = "#EarnGPT #MakeMoneyOnline #ReferralProgram #PassiveIncome";

export function ReferralsView({
  referralCode,
  shareUrl,
  l1Count,
  l2Count,
  l3Count,
  l1Earned,
  l2Earned,
  l3Earned,
  thisMonthEarned,
  team,
}: ReferralsViewProps) {
  const totalCount = l1Count + l2Count + l3Count;
  const totalEarned = l1Earned + l2Earned + l3Earned;
  const [showQr, setShowQr] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "L1" | "L2" | "L3">("ALL");
  const [dailyClaim, setDailyClaim] = useState<{
    points: number;
    perReferral: number;
    referralCount: number;
    canClaim: boolean;
    claimed: boolean;
    missionRequired: boolean;
    missionComplete: boolean;
    missionId: string | null;
  } | null>(null);
  const [claimingDaily, setClaimingDaily] = useState(false);

  const loadDailyClaim = useCallback(async () => {
    try {
      const r = await fetch("/api/referrals/daily-claim", { cache: "no-store" });
      if (r.ok) setDailyClaim(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadDailyClaim();
  }, [loadDailyClaim]);

  // Live refresh: tab refocus + 15s timer (paused while tab hidden).
  useAutoRefresh(loadDailyClaim);

  const claimDaily = async () => {
    setClaimingDaily(true);
    try {
      const res = await fetch("/api/referrals/daily-claim", {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      notifyCenter.reward({
        amount: d.points,
        unit: "pts",
        title: "Referral bonus claimed!",
        description: `${d.referralCount} referrals × ${d.perReferral} pts`,
      });
      // Refresh status
      const sRes = await fetch("/api/referrals/daily-claim");
      if (sRes.ok) setDailyClaim(await sRes.json());
    } catch (err) {
      notifyCenter.error(
        "Couldn't claim",
        err instanceof Error ? err.message : "Try again"
      );
    } finally {
      setClaimingDaily(false);
    }
  };

  const filteredTeam = useMemo(() => {
    if (filter === "ALL") return team;
    return team.filter((m) => `L${m.level}` === filter);
  }, [filter, team]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy")
    );
  };

  // Referral commissions are auto-credited to the wallet at the time the
  // referred user earns. There is no separate "claim" action — direct users
  // to their wallet to see the balance.

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-purple-400" />
          My Team
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Invite friends, build a team, earn passive commission for life.
        </p>
      </header>

      {/* Total earnings header card */}
      <div className="rounded-2xl bg-linear-to-r from-purple-600/25 to-pink-500/15 border border-purple-500/40 backdrop-blur-xl p-5">
        <p className="text-xs uppercase tracking-widest font-bold text-purple-200">
          Total Referral Earnings
        </p>
        <p className="text-4xl font-extrabold text-white tabular-nums mt-1">
          {usd(totalEarned)}
        </p>
        <div className="flex items-center gap-3 text-xs text-purple-200/80 mt-2">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {totalCount} {totalCount === 1 ? "referral" : "referrals"}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            +{usd(thisMonthEarned)} this month
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {dailyClaim && dailyClaim.referralCount > 0 && (
            <button
              onClick={claimDaily}
              disabled={
                claimingDaily ||
                !dailyClaim.canClaim ||
                dailyClaim.claimed
              }
              className={
                dailyClaim.claimed
                  ? "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 text-sm font-bold cursor-default"
                  : dailyClaim.canClaim
                  ? "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold disabled:opacity-50"
                  : "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm font-bold cursor-not-allowed"
              }
              title={
                dailyClaim.claimed
                  ? "Already claimed today"
                  : dailyClaim.missionRequired && !dailyClaim.missionComplete
                  ? "Complete today's daily mission first"
                  : "Claim today's bonus"
              }
            >
              <Coins className="w-4 h-4" />
              {dailyClaim.claimed
                ? "Daily Bonus Claimed ✓"
                : dailyClaim.canClaim
                ? `Claim ${dailyClaim.points} pts`
                : "Mission Required 🔒"}
            </button>
          )}
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/20 text-white text-sm font-bold border border-purple-500/40 hover:bg-purple-500/30"
          >
            View in Wallet
          </Link>
        </div>
        {dailyClaim?.missionRequired && !dailyClaim.missionComplete && !dailyClaim.claimed && (
          <p className="text-[11px] text-amber-300 mt-2 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <Link href="/daily-mission" className="underline hover:text-amber-200">
              Complete today&apos;s daily mission
            </Link>
            {" "}to unlock today&apos;s referral bonus.
          </p>
        )}
        <p className="text-[11px] text-purple-200/70 mt-2">
          L2/L3 commissions auto-credit to your wallet. Daily bonus = referrals × your tier rate.
        </p>
      </div>

      {/* 3-level commission cards */}
      <section>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
          Commission Structure
        </p>
        <div className="grid grid-cols-3 gap-2">
          <CommissionCard
            level={1}
            pct={10}
            count={l1Count}
            earned={l1Earned}
            tone="emerald"
          />
          <CommissionCard
            level={2}
            pct={5}
            count={l2Count}
            earned={l2Earned}
            tone="purple"
          />
          <CommissionCard
            level={3}
            pct={2}
            count={l3Count}
            earned={l3Earned}
            tone="amber"
          />
        </div>
      </section>

      {/* Referral link & code */}
      <section className="glass rounded-xl p-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
            Your Code
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-amber-400 font-mono font-bold tracking-widest text-center">
              {referralCode}
            </code>
            <button
              onClick={() => copyText(referralCode, "Code")}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
              aria-label="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
            Share Link
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white text-sm focus:outline-none"
            />
            <button
              onClick={() => copyText(shareUrl, "Link")}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
              aria-label="Copy link"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowQr((v) => !v)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            <QrCode className="w-4 h-4" />
            {showQr ? "Hide QR" : "Show QR"}
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-linear-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold hover:scale-[1.02] transition-transform"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>

        {showQr && <QrPanel url={shareUrl} />}
      </section>

      {/* Team list */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-white">Your Team</h2>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            {filteredTeam.length} of {team.length}
          </p>
        </div>
        <FilterChips
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={[
            { value: "ALL", label: "All", count: team.length },
            { value: "L1", label: "L1", count: l1Count },
            { value: "L2", label: "L2", count: l2Count },
            { value: "L3", label: "L3", count: l3Count },
          ]}
        />

        {filteredTeam.length === 0 ? (
          <EmptyState
            icon={Users}
            title={team.length === 0 ? "No referrals yet" : "No matches"}
            description={
              team.length === 0
                ? "Share your link to start building your team."
                : "Try a different level filter."
            }
          />
        ) : (
          <div className="glass rounded-xl divide-y divide-gray-800 mt-2">
            {filteredTeam.slice(0, 50).map((m) => {
              const tone =
                m.level === 1
                  ? "bg-emerald-500/15 text-emerald-400"
                  : m.level === 2
                    ? "bg-purple-500/15 text-purple-400"
                    : "bg-amber-500/15 text-amber-400";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Avatar
                    src={m.avatar}
                    name={m.name}
                    fallbackText={m.name ? undefined : "?"}
                    size={36}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {m.name ?? "Anonymous"}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      Joined {format(new Date(m.joinedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                      tone
                    )}
                  >
                    L{m.level}
                  </span>
                  <span className="text-sm font-bold text-emerald-400 tabular-nums w-16 text-right">
                    {usd(m.earnings)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ShareModal
        open={showShare}
        onOpenChange={setShowShare}
        url={shareUrl}
        title="Join me on EarnGPT"
        text={`Sign up with my code ${referralCode} and start earning! ${HASHTAGS}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CommissionCard({
  level,
  pct,
  count,
  earned,
  tone,
}: {
  level: number;
  pct: number;
  count: number;
  earned: number;
  tone: "emerald" | "purple" | "amber";
}) {
  const tones = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  } as const;
  return (
    <div
      className={cn(
        "rounded-xl border backdrop-blur-xl p-3",
        tones[tone]
      )}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold opacity-90">
        Level {level}
      </p>
      <p className={cn(STAT_VALUE_CLASS, "mt-1")}>{pct}%</p>
      {/* min-w-0 + shrink-0: a 4-figure earnings figure used to collide with
          the user count in this justify-between row. */}
      <div className="mt-1.5 flex items-center justify-between gap-1.5 text-[10px]">
        <span className="text-gray-400 truncate min-w-0">{count} users</span>
        <span className="font-bold tabular-nums shrink-0">{usd(earned)}</span>
      </div>
    </div>
  );
}

function QrPanel({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Lazy-load the qrcode lib on first render of the panel.
    import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(url, {
          width: 256,
          margin: 1,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        })
      )
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "earngpt-referral-qr.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex flex-col items-center gap-3">
      {loading ? (
        <div className="w-48 h-48 rounded-xl bg-white/5 animate-pulse" />
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="Referral QR code"
          className="w-48 h-48 rounded-xl bg-white"
        />
      ) : (
        <div className="w-48 h-48 rounded-xl bg-gray-800 flex items-center justify-center text-gray-500 text-xs">
          QR generation failed
        </div>
      )}
      <p className="text-xs text-indigo-200/80 text-center">
        Scan to open the referral link
      </p>
      <button
        onClick={download}
        disabled={!dataUrl}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        Download QR
      </button>
    </div>
  );
}

// Avoid noisy unused-import warnings
void CheckCircle;
void Sparkles;
void X;
