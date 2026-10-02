"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Copy,
  Share2,
  QrCode,
  Download,
  TrendingUp,
  Coins,
  Sparkles,
  Search,
  Wallet,
  UserPlus,
  Gift,
  Trophy,
  Layers,
  Activity,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { notifyCenter } from "@/lib/notify-center";
import { newIdempotencyKey } from "@/lib/idempotency-key";
// `qrcode` is loaded lazily (only when the QR panel renders) so it stays out of
// the initial referrals-page chunk — see QrPanel below.
import { format } from "date-fns";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { Avatar } from "@/components/user/primitives/avatar";
import { cn, usd } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

export interface ReferralUser {
  id: string;
  name: string | null;
  avatar: string | null;
  level: number;
  joinedAt: string;
  earnings: number;
  isActive: boolean;
}

/** The referral bonuses the admin has switched on (referral_bonus_config). */
export interface ReferralBonusInfo {
  /** One line per active bonus: "Friend signs up" → "+500 pts". */
  perks: Array<{ label: string; reward: string }>;
  milestones: Array<{ id: string; label: string; referrals: number; reward: string }>;
  /** Active referrals counted toward the milestones; null when milestones are off. */
  milestoneProgress: number | null;
  /** How "active" is judged for milestones, in words. */
  activeRule: string | null;
}

export interface ReferralsViewProps {
  referralCode: string;
  shareUrl: string;
  /** The levels the admin set (rate, members, commission earned) — lib/team.ts. */
  levels: Array<{ level: number; rateLabel: string; count: number; earnedUsd: number }>;
  totalEarned: number;
  thisMonthEarned: number;
  team: ReferralUser[];
  bonuses: ReferralBonusInfo;
}

const HASHTAGS = "#RevType #MakeMoneyOnline #ReferralProgram #PassiveIncome";
const PAGE = 30;

/**
 * My Team. Top to bottom in the order people use it: what I have earned →
 * how to invite → what I get for it → the commission per level → who is in
 * my team. Nothing scrolls sideways — every filter wraps onto the next line.
 */
export function ReferralsView({
  referralCode,
  shareUrl,
  levels,
  totalEarned,
  thisMonthEarned,
  team,
  bonuses,
}: ReferralsViewProps) {
  const totalCount = levels.reduce((a, l) => a + l.count, 0);
  const activeCount = team.filter((m) => m.isActive).length;
  const [showQr, setShowQr] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [filter, setFilter] = useState<number | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
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
      const sRes = await fetch("/api/referrals/daily-claim");
      if (sRes.ok) setDailyClaim(await sRes.json());
    } catch (err) {
      notifyCenter.error("Couldn't claim", err instanceof Error ? err.message : "Try again");
    } finally {
      setClaimingDaily(false);
    }
  };

  const filteredTeam = useMemo(() => {
    const q = query.trim().toLowerCase();
    return team.filter(
      (m) => (filter === "ALL" || m.level === filter) && (!q || (m.name ?? "").toLowerCase().includes(q))
    );
  }, [filter, query, team]);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy")
    );
  };

  // "3% on each of 10 levels" when the admin set one rate everywhere.
  const sameRate = levels.length > 1 && levels.every((l) => l.rateLabel === levels[0].rateLabel);
  const rateSummary = levels.length
    ? sameRate
      ? `${levels[0].rateLabel} on each of ${levels.length} levels`
      : `${levels[0].rateLabel} on level 1${levels.length > 1 ? `, up to ${levels.length} levels deep` : ""}`
    : "";

  const nextMilestone =
    bonuses.milestoneProgress !== null
      ? bonuses.milestones.find((m) => m.referrals > (bonuses.milestoneProgress ?? 0)) ?? null
      : null;

  const chip = (active: boolean) =>
    cn(
      "app-press inline-flex items-center gap-1.5 rounded-(--app-r-chip) border px-3 py-1.5 text-xs font-bold",
      active
        ? "border-(--app-accent-edge) bg-(--app-nav-wash) text-(--app-nav-on)"
        : "border-(--app-line) text-(--app-ink-3) hover:text-(--app-ink)"
    );

  return (
    <div className="space-y-(--app-gap)">
      <header>
        <h1 className="t-title text-white inline-flex items-center gap-2.5">
          <Users className="w-6 h-6 text-(--app-ink-3)" />
          My Team
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Invite friends and earn from what they earn{rateSummary ? ` — ${rateSummary}` : ""}.
        </p>
      </header>

      {/* ── Earnings ─────────────────────────────────────────────────────── */}
      <section className="rounded-(--app-r-card) bg-(image:--app-grad) p-5 text-white shadow-(--app-grad-glow)">
        <p className="text-xs font-bold uppercase tracking-wider text-white/80">Total team earnings</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums">{usd(totalEarned)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Team members", value: totalCount.toLocaleString(), icon: Users },
            { label: "Active this week", value: activeCount.toLocaleString(), icon: Activity },
            { label: "This month", value: usd(thisMonthEarned), icon: TrendingUp },
          ].map((s) => (
            <div key={s.label} className="min-w-0 rounded-(--app-r-control) bg-white/10 px-2.5 py-2">
              <s.icon className="h-4 w-4 text-white/80" />
              <p className="mt-1 truncate text-base font-extrabold tabular-nums">{s.value}</p>
              <p className="truncate text-[10px] text-white/75">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {dailyClaim && dailyClaim.referralCount > 0 && (
            <button
              onClick={claimDaily}
              disabled={claimingDaily || !dailyClaim.canClaim || dailyClaim.claimed}
              className={cn(
                "app-press inline-flex items-center gap-1.5 rounded-(--app-r-control) px-4 py-2 text-sm font-bold",
                dailyClaim.claimed
                  ? "bg-white/15 text-white cursor-default"
                  : dailyClaim.canClaim
                    ? "bg-white text-(--app-grad-a) disabled:opacity-50"
                    : "bg-black/20 text-white/85 cursor-not-allowed"
              )}
            >
              <Coins className="w-4 h-4" />
              {dailyClaim.claimed
                ? "Daily bonus claimed ✓"
                : dailyClaim.canClaim
                  ? `Claim ${dailyClaim.points} pts`
                  : "Daily mission first"}
            </button>
          )}
          <Link
            href="/wallet?tab=referral"
            className="app-press inline-flex items-center gap-1.5 rounded-(--app-r-control) border border-white/30 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
          >
            <Wallet className="w-4 h-4" />
            View in Wallet
          </Link>
        </div>
        {dailyClaim?.missionRequired && !dailyClaim.missionComplete && !dailyClaim.claimed && dailyClaim.referralCount > 0 && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/85">
            <Sparkles className="w-3 h-3" />
            <Link href="/daily-mission" className="underline">
              Complete today&apos;s daily mission
            </Link>{" "}
            to unlock today&apos;s team bonus.
          </p>
        )}
      </section>

      {/* ── Invite ───────────────────────────────────────────────────────── */}
      <section className="app-card space-y-3">
        <h2 className="t-section text-white">Invite friends</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="t-meta mb-1 text-(--app-ink-3)">Your code</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-(--app-r-control) border border-(--app-line) bg-(--app-page) px-3 py-2 text-center font-mono font-bold tracking-widest text-amber-400">
                {referralCode}
              </code>
              <button
                onClick={() => copyText(referralCode, "Code")}
                className="app-press app-tap shrink-0 inline-flex items-center justify-center rounded-(--app-r-control) bg-(--app-surface-2) text-(--app-ink-2) hover:text-(--app-ink)"
                aria-label="Copy code"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <p className="t-meta mb-1 text-(--app-ink-3)">Your link</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="min-w-0 flex-1 rounded-(--app-r-control) border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-(--app-ink) focus:outline-none"
              />
              <button
                onClick={() => copyText(shareUrl, "Link")}
                className="app-press app-tap shrink-0 inline-flex items-center justify-center rounded-(--app-r-control) bg-(--app-surface-2) text-(--app-ink-2) hover:text-(--app-ink)"
                aria-label="Copy link"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowShare(true)}
            className="app-accent app-press app-tap-row inline-flex items-center justify-center gap-1.5 rounded-(--app-r-control) text-sm font-extrabold"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
          <button
            onClick={() => setShowQr((v) => !v)}
            className="app-press app-tap-row inline-flex items-center justify-center gap-1.5 rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface-2) text-sm font-bold text-(--app-ink)"
          >
            <QrCode className="w-4 h-4" />
            {showQr ? "Hide QR" : "QR code"}
          </button>
        </div>
        {showQr && <QrPanel url={shareUrl} />}

        {/* How it works */}
        <ol className="grid gap-2 border-t border-(--app-line) pt-3 sm:grid-cols-3">
          {[
            { icon: Share2, title: "Share your link", text: "Send it to friends or post it anywhere." },
            { icon: UserPlus, title: "They join and earn", text: "They sign up with your code and complete tasks." },
            {
              icon: Coins,
              title: "You earn with them",
              text: rateSummary ? `You get ${rateSummary} — paid to your wallet automatically.` : "Commission is paid to your wallet automatically.",
            },
          ].map((s, i) => (
            <li key={s.title} className="flex items-start gap-2.5">
              <span className="app-icon shrink-0">
                <s.icon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {i + 1}. {s.title}
                </p>
                <p className="text-xs text-(--app-ink-3)">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Bonuses + milestones (only what the admin has switched on) ─────── */}
      {(bonuses.perks.length > 0 || bonuses.milestones.length > 0) && (
        <section className="app-card space-y-3">
          <h2 className="t-section inline-flex items-center gap-2 text-white">
            <Gift className="w-4 h-4 text-amber-400" />
            Referral bonuses
          </h2>
          {bonuses.perks.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {bonuses.perks.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-2 rounded-(--app-r-control) bg-(--app-surface-2) px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-(--app-ink-2)">{p.label}</span>
                  <span className="shrink-0 font-extrabold tabular-nums text-amber-300">{p.reward}</span>
                </li>
              ))}
            </ul>
          )}
          {bonuses.milestones.length > 0 && (
            <div>
              <p className="t-meta mb-2 inline-flex items-center gap-1.5 text-(--app-ink-3)">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                Milestones{bonuses.activeRule ? ` · ${bonuses.activeRule}` : ""}
              </p>
              {nextMilestone && bonuses.milestoneProgress !== null && (
                <div className="mb-2 rounded-(--app-r-control) border border-(--app-line) p-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-bold text-white">
                      {nextMilestone.referrals - bonuses.milestoneProgress} more to {nextMilestone.label}
                    </span>
                    <span className="text-xs tabular-nums text-(--app-ink-3)">
                      {bonuses.milestoneProgress}/{nextMilestone.referrals}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-(--app-surface-2)">
                    <div
                      className="h-full bg-(image:--app-rail)"
                      style={{ width: `${Math.min(100, (bonuses.milestoneProgress / nextMilestone.referrals) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <ul className="space-y-1">
                {bonuses.milestones.map((m) => {
                  const done = bonuses.milestoneProgress !== null && bonuses.milestoneProgress >= m.referrals;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-1 py-1.5 text-sm">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold",
                          done ? "bg-(--app-cta) text-(--app-on-cta)" : "bg-(--app-surface-2) text-(--app-ink-3)"
                        )}
                      >
                        {done ? "✓" : m.referrals}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-(--app-ink-2)">
                        <span className="font-bold text-white">{m.label}</span> · {m.referrals} active referrals
                      </span>
                      <span className="shrink-0 font-bold text-amber-300">{m.reward}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Commission per level — the admin's rates ──────────────────────── */}
      <section className="app-card">
        <div className="mb-2">
          <h2 className="t-section inline-flex items-center gap-2 text-white">
            <Layers className="w-4 h-4 text-(--app-ink-3)" />
            Commission by level
          </h2>
          {rateSummary && <p className="t-meta mt-0.5 text-(--app-ink-3)">You earn {rateSummary}</p>}
        </div>
        <div className="overflow-hidden rounded-(--app-r-control) border border-(--app-line)">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 bg-(--app-surface-2) px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-(--app-ink-3)">
            <span>Level</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Members</span>
            <span className="w-16 text-right">Earned</span>
          </div>
          {levels.map((l) => (
            <div
              key={l.level}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 border-t border-(--app-line) px-3 py-2 text-sm",
                l.count === 0 && "text-(--app-ink-3)"
              )}
            >
              <span className="font-bold text-white">
                Level {l.level}
                {l.level === 1 && <span className="ml-1.5 text-[10px] font-semibold text-(--app-ink-3)">direct</span>}
              </span>
              <span className="text-right font-bold tabular-nums text-(--app-accent-ink)">{l.rateLabel}</span>
              <span className="text-right tabular-nums">{l.count.toLocaleString()}</span>
              <span className="w-16 text-right font-bold tabular-nums">{usd(l.earnedUsd)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Team list ────────────────────────────────────────────────────── */}
      <section className="app-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="t-section text-white">Your team</h2>
          <span className="t-meta text-(--app-ink-3)">
            {filteredTeam.length} of {team.length}
          </span>
        </div>
        {team.length > 0 && (
          <>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--app-ink-3)" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="Search your team"
                className="w-full rounded-(--app-r-control) border border-(--app-line) bg-(--app-page) py-2 pl-9 pr-3 text-sm text-(--app-ink) focus:border-(--app-accent-edge) focus:outline-none"
              />
            </div>
            {/* Wraps — never a sideways scroll with levels hidden off-screen. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button className={chip(filter === "ALL")} onClick={() => setFilter("ALL")}>
                All <span className="tabular-nums opacity-70">{team.length}</span>
              </button>
              {levels
                .filter((l) => l.count > 0)
                .map((l) => (
                  <button key={l.level} className={chip(filter === l.level)} onClick={() => { setFilter(l.level); setShown(PAGE); }}>
                    L{l.level} <span className="tabular-nums opacity-70">{l.count}</span>
                  </button>
                ))}
            </div>
          </>
        )}

        {filteredTeam.length === 0 ? (
          <EmptyState
            icon={Users}
            title={team.length === 0 ? "No one in your team yet" : "No matches"}
            description={team.length === 0 ? "Share your link above — everyone who joins with it shows up here." : "Try another level or name."}
          />
        ) : (
          <>
            <ul className="divide-y divide-(--app-line)">
              {filteredTeam.slice(0, shown).map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <div className="relative shrink-0">
                    <Avatar src={m.avatar} name={m.name} fallbackText={m.name ? undefined : "?"} size={36} />
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-(--app-surface)",
                        m.isActive ? "bg-emerald-400" : "bg-(--app-ink-3)"
                      )}
                      title={m.isActive ? "Active this week" : "Not seen this week"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{m.name ?? "Anonymous"}</p>
                    <p className="text-[11px] text-(--app-ink-3)">
                      Level {m.level} · joined {format(new Date(m.joinedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-(--app-accent-ink)">{usd(m.earnings)}</p>
                    <p className="text-[10px] text-(--app-ink-3)">earned you</p>
                  </div>
                </li>
              ))}
            </ul>
            {filteredTeam.length > shown && (
              <button
                onClick={() => setShown((n) => n + PAGE)}
                className="app-press app-tap-row mt-2 w-full rounded-(--app-r-control) border border-(--app-line) text-sm font-bold text-(--app-ink-2) hover:text-(--app-ink)"
              >
                Show more ({filteredTeam.length - shown})
              </button>
            )}
          </>
        )}
      </section>

      <ShareModal
        open={showShare}
        onOpenChange={setShowShare}
        url={shareUrl}
        title="Join me on RevType"
        text={`Sign up with my code ${referralCode} and start earning! ${HASHTAGS}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
          color: { dark: "#0f172a", light: "#ffffff" },
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
    a.download = "revtype-referral-qr.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col items-center gap-3 rounded-(--app-r-control) border border-(--app-line) bg-(--app-page) p-4">
      {loading ? (
        <div className="h-48 w-48 animate-pulse rounded-xl bg-white/5" />
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="Referral QR code" className="h-48 w-48 rounded-xl bg-white" />
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-(--app-surface-2) text-xs text-(--app-ink-3)">
          QR generation failed
        </div>
      )}
      <p className="text-center text-xs text-(--app-ink-3)">Scan to open your invite link</p>
      <button
        onClick={download}
        disabled={!dataUrl}
        className="app-press inline-flex items-center gap-1.5 rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface-2) px-3 py-1.5 text-xs font-bold text-(--app-ink) disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        Download QR
      </button>
    </div>
  );
}
