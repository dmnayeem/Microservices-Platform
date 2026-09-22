"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Avatar } from "@/components/user/primitives/avatar";
import {
  Trophy,
  Crown,
  Hash,
  Flame,
  UserPlus,
  Check,
  BadgeCheck,
  Coins,
  Gift,
  Target,
  Zap,
  Users,
  Copy,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Circle,
  ChevronDown,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pct, pts } from "@/lib/utils";
import { profileHref } from "@/lib/user-href";
import { missionItemLabel, TYPE_TO_ROUTE } from "@/lib/mission-labels";
import { notifyCenter } from "@/lib/notify-center";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { BalanceSkeleton } from "@/components/user/primitives/skeleton";
import {
  DEFAULT_WIDGET_CONFIG,
  RAIL_GROUPS,
  widgetGroupOf,
  type FeedWidgetConfig,
  type FeedWidgetGroup,
  type FeedWidgetGroupDef,
} from "@/lib/feed-widgets";
// `COLOR_CLASSES` is deliberately not imported: the admin still picks a colour
// per Quick Earn tile and it is still stored, but the rail renders these
// neutral — see the Quick Earn grid below.
import {
  DEFAULT_QUICK_EARN,
  QUICK_EARN_ICONS,
  type QuickEarnTile,
} from "@/lib/feed-quick-earn";
import type { CustomWidget } from "@/lib/feed-custom-widgets";

export interface RailEarner {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  level: number;
}

export interface RailFollowUser {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  level: number;
  isBlueVerified?: boolean;
  followersCount: number;
}

export interface RailPromo {
  title: string;
  subtitle: string | null;
  bgGradient: string | null;
  linkUrl: string | null;
}

interface Props {
  bestEarners: RailEarner[];
  whoToFollow: RailFollowUser[];
  trendingHashtags: { tag: string; count: number }[];
  promo?: RailPromo | null;
  /** Admin-configured widget order + enablement (see Settings → Feed Widgets). */
  widgetConfig?: FeedWidgetConfig;
  /** Admin-editable Quick Earn tiles. */
  quickEarn?: QuickEarnTile[];
  /** Admin-created custom sidebar widgets. */
  customWidgets?: CustomWidget[];
  /**
   * Render the band headings. The rail wants them; a one-off embed that only
   * needs the cards can turn them off without forking the component.
   */
  showHeadings?: boolean;
  /** Legal/footer links — the rail shows them, the mobile sheet does not. */
  showFooter?: boolean;
}

interface RailWidgets {
  balance: { points: number; todayEarnings: number };
  streak: { current: number; canClaim: boolean };
  mission: {
    name: string;
    done: number;
    total: number;
    claimedToday: boolean;
    rewardPoints: number;
    rewardXp: number;
    items: {
      taskType: string;
      description: string | null;
      points: number;
      target: number;
      completedToday: number;
      done: boolean;
    }[];
  } | null;
  referral: { code: string | null; link: string | null; totalReferrals: number };
}


function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="app-card">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="t-section text-(--app-ink) inline-flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function FollowButton({ userId }: { userId: string }) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    const next = !following;
    setFollowing(next); // optimistic
    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setFollowing(!next); // revert
      toast.error("Couldn't update follow");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        "app-press app-tap-row inline-flex items-center gap-1.5 px-3.5 rounded-full text-xs font-extrabold shrink-0 border disabled:opacity-50",
        following
          ? "bg-(--app-surface-2) text-(--app-ink-2) border-(--app-line)"
          : "bg-transparent text-(--app-accent-ink) border-(--app-accent-edge) hover:bg-(--app-nav-wash)"
      )}
    >
      {following ? (
        <>
          <Check className="w-3 h-3" /> Following
        </>
      ) : (
        <>
          <UserPlus className="w-3 h-3" /> Follow
        </>
      )}
    </button>
  );
}

/** Balance + today's earnings + login-streak flame with an inline claim. */
function EarnStreakCard({
  data,
  onClaimed,
}: {
  data: RailWidgets;
  onClaimed: (newStreak: number) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(!data.streak.canClaim);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/daily-reward", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't claim");
      setClaimed(true);
      onClaimed(d.newStreak ?? data.streak.current + 1);
      notifyCenter.reward({
        amount: d.reward?.points ?? 0,
        unit: "pts",
        title: "Daily reward claimed!",
        description: `Day ${d.reward?.day ?? ""} streak 🔥`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setClaiming(false);
    }
  };

  return (
    /* The rail's money card, matched to the phone one so the same numbers look
       the same at every width. Was a glass panel with an amber coin, an emerald
       today figure and an orange streak strip — four colours around one
       balance. One gradient, one figure, everything else white. */
    <section className="app-accent app-accent-glow rounded-(--app-r-card) p-(--app-pad)">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-eyebrow text-white/90">Your balance</p>
          <p className="t-figure mt-1 inline-flex items-center gap-2 min-w-0 whitespace-nowrap text-white">
            <Coins className="w-6 h-6 shrink-0 text-white/90" />
            {pts(data.balance.points)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="t-eyebrow text-white/90">Today</p>
          <p className="t-figure-sm mt-1 text-white">
            +{data.balance.todayEarnings.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-(--app-r-control) bg-black/20 border border-white/25 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
          <Flame className="w-4 h-4" />
          {data.streak.current}-day streak
        </span>
        {claimed ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-white/90">
            <Check className="w-3.5 h-3.5" /> Claimed
          </span>
        ) : (
          <button
            onClick={claim}
            disabled={claiming}
            className="app-press app-tap-row inline-flex items-center gap-1.5 px-4 rounded-full app-on-white [--app-on-white-ink:var(--app-on-bright)] bg-(--app-bright) text-xs font-extrabold disabled:opacity-60"
          >
            {claiming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Gift className="w-3.5 h-3.5" />
            )}
            Claim
          </button>
        )}
      </div>
    </section>
  );
}

/** Refer & earn — code + copy link + count. */
function ReferralCard({ referral }: { referral: RailWidgets["referral"] }) {
  const [copied, setCopied] = useState(false);
  if (!referral.code || !referral.link) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referral.link!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <Card
      title="Refer & Earn"
      icon={<Users className="w-4 h-4 text-(--app-ink-3)" />}
      action={
        <Link
          href="/referrals"
          className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
        >
          Details
        </Link>
      }
    >
      <p className="t-meta text-(--app-ink-3)">
        Invite friends — earn commission on their activity.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="app-tap-row flex-1 min-w-0 flex items-center truncate rounded-(--app-r-control) bg-(--app-surface-2) border border-(--app-line) px-3 text-sm font-mono font-bold text-(--app-ink)">
          {referral.code}
        </code>
        <button
          onClick={copy}
          className="app-accent app-press app-tap-row inline-flex items-center gap-1.5 px-3.5 rounded-(--app-r-control) text-xs font-extrabold shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2.5 t-meta text-(--app-ink-3)">
        {referral.totalReferrals} referral
        {referral.totalReferrals === 1 ? "" : "s"} joined
      </p>
    </Card>
  );
}

export function FeedRightRail({
  bestEarners,
  whoToFollow,
  trendingHashtags,
  promo,
  widgetConfig = DEFAULT_WIDGET_CONFIG,
  quickEarn = DEFAULT_QUICK_EARN,
  customWidgets = [],
  showHeadings = true,
  showFooter = true,
}: Props) {
  const rankTone = ["text-amber-400", "text-(--app-ink-2)", "text-orange-400"];
  const [widgets, setWidgets] = useState<RailWidgets | null>(null);
  const quickTiles = quickEarn.filter((t) => t.enabled);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feed/rail-widgets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && d.balance) setWidgets(d as RailWidgets);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Each configurable widget's markup, keyed by its catalog id. Admin config
  // decides which of these render and in what order (see feed-widgets.ts).
  const renderers: Record<string, ReactNode> = {
    sponsored: <AdRenderer placement="FEED_SIDEBAR" />,
    earnStreak: widgets ? (
      <EarnStreakCard
        data={widgets}
        onClaimed={(newStreak) =>
          setWidgets((w) =>
            w ? { ...w, streak: { current: newStreak, canClaim: false } } : w
          )
        }
      />
    ) : (
      <BalanceSkeleton />
    ),
    dailyMission:
      widgets?.mission && widgets.mission.total > 0 ? (
        <Card
          title="Daily Mission"
          icon={<Target className="w-4 h-4 text-(--app-ink-3)" />}
          action={
            <Link
              href="/daily-mission"
              className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
            >
              Continue <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-(--app-ink-3)">
              {widgets.mission.done}/{widgets.mission.total} done
            </span>
            {widgets.mission.claimedToday && (
              <span className="t-in inline-flex items-center gap-1 font-bold">
                <Check className="w-3 h-3" /> Claimed
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-(--app-surface-2) overflow-hidden">
            <div
              className="h-full rounded-full bg-(image:--app-rail) transition-all"
              style={{
                // pct(): guarded — a mission with 0 steps produced NaN%.
                width: `${pct(widgets.mission.done, widgets.mission.total)}%`,
              }}
            />
          </div>

          {/* Task breakdown — name + progress + points, so it's clear what the
              mission is and what each task pays. */}
          {widgets.mission.items.length > 0 && (
            // The two number columns are FIXED width and right-aligned. They
            // used to follow a flexible label directly, so "0/5" and "+50"
            // landed at a different x on every row depending on how long the
            // task name was — nine rows of numbers in nine different places,
            // which is what made this read as a jumble rather than a list.
            // Fixed columns turn it into something the eye can scan down.
            <ul className="mt-3 space-y-px">
              {widgets.mission.items.map((it, i) => (
                <li
                  key={`${it.taskType}-${i}`}
                  className="flex items-center gap-2 text-xs rounded-md px-1 py-1.25 transition-colors hover:bg-(--app-surface-2)"
                >
                  {it.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-(--app-in)" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-(--app-ink-3) shrink-0" />
                  )}
                  <span
                    className={cn(
                      "flex-1 min-w-0 truncate",
                      it.done ? "text-(--app-ink-3) line-through" : "text-(--app-ink-2)"
                    )}
                  >
                    {missionItemLabel(it.taskType, it.description)}
                  </span>
                  <span className="w-9 text-right text-(--app-ink-3) tabular-nums shrink-0">
                    {it.completedToday}/{it.target}
                  </span>
                  <span className="w-12 inline-flex items-center justify-end gap-0.5 text-(--app-ink-2) font-bold tabular-nums shrink-0">
                    <Coins className="w-3 h-3 shrink-0" />+{it.points}
                  </span>
                  {/* Start — beside the points, because that is where someone
                      is looking when they decide a row is worth doing.
                      It goes to the page for THAT task type rather than the
                      mission page: the row already says what the job is, so
                      landing on a list and having to find it again is a step
                      nobody needs. `TYPE_TO_ROUTE` already exists and is what
                      the mission page itself uses, so the two cannot disagree.
                      A finished row gets a tick instead — an enabled Start on
                      something already done is an invitation to waste a trip. */}
                  {it.done ? (
                    <span className="w-14 shrink-0 text-right t-meta font-bold text-(--app-in)">
                      Done
                    </span>
                  ) : (
                    <Link
                      href={TYPE_TO_ROUTE[it.taskType] ?? "/daily-mission"}
                      aria-label={`Start: ${missionItemLabel(it.taskType, it.description)}`}
                      className="app-press w-14 shrink-0 inline-flex h-7 items-center justify-center rounded-(--app-r-chip) border border-(--app-line) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
                    >
                      Start
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          {widgets.mission.rewardPoints > 0 && (
            <p className="mt-2.5 pt-2.5 border-t border-(--app-line) t-meta text-(--app-ink-3)">
              Complete all →{" "}
              <span className="font-extrabold text-(--app-ink)">
                +{widgets.mission.rewardPoints} pts
              </span>
              {widgets.mission.rewardXp > 0 && (
                <span className="font-extrabold text-(--app-ink)">
                  {" "}
                  · +{widgets.mission.rewardXp} XP
                </span>
              )}
            </p>
          )}
        </Card>
      ) : null,
    quickEarn:
      quickTiles.length > 0 ? (
        <Card title="Quick Earn" icon={<Zap className="w-4 h-4 text-(--app-ink-3)" />}>
          <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
            {quickTiles.map((q) => {
              const Icon = QUICK_EARN_ICONS[q.icon] ?? Zap;
              return (
                <Link
                  key={q.id}
                  href={q.href}
                  className="app-tile app-press app-lift app-tap-row flex items-center gap-2.5 text-sm font-bold text-(--app-ink)"
                >
                  <Icon className="w-4 h-4 shrink-0 text-(--app-ink-3)" />
                  <span className="truncate min-w-0">{q.label}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null,
    referral: widgets ? <ReferralCard referral={widgets.referral} /> : null,
    topEarners:
      bestEarners.length > 0 ? (
        <Card
          title="Top Earners"
          icon={<Trophy className="w-4 h-4 text-amber-400" />}
          action={
            <Link href="/leaderboard" className="text-xs text-(--app-accent-ink) hover:text-(--app-accent-ink)">
              See all
            </Link>
          }
        >
          <ul className="space-y-2.5">
            {bestEarners.map((u, i) => (
              <li key={u.id}>
                <Link href={profileHref(u)} className="flex items-center gap-2.5 group">
                  <span
                    className={cn(
                      "w-4 text-center text-xs font-bold tabular-nums",
                      rankTone[i] ?? "text-(--app-ink-3)"
                    )}
                  >
                    {i < 3 ? <Crown className="w-3.5 h-3.5 inline" /> : i + 1}
                  </span>
                  <Avatar size={36} src={u.avatar} name={u.name} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-(--app-ink) truncate group-hover:text-(--app-accent-ink)">
                      {u.name ?? "Anonymous"}
                    </p>
                    <p className="text-[11px] text-(--app-ink-3)">Level {u.level}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null,
    whoToFollow:
      whoToFollow.length > 0 ? (
        <Card title="Who to Follow" icon={<UserPlus className="w-4 h-4 text-(--app-accent-ink)" />}>
          <ul className="space-y-3">
            {whoToFollow.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5">
                <Link href={profileHref(u)}>
                  <Avatar size={36} src={u.avatar} name={u.name} className="shrink-0" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    href={profileHref(u)}
                    className="text-sm font-semibold text-(--app-ink) truncate inline-flex items-center gap-1 hover:text-(--app-accent-ink)"
                  >
                    <span className="truncate min-w-0">{u.name ?? "Anonymous"}</span>
                    {u.isBlueVerified && (
                      <span
                        title="Verified"
                        aria-label="Verified"
                        className="inline-flex shrink-0"
                      >
                        <BadgeCheck className="w-3.5 h-3.5 text-sky-400" />
                      </span>
                    )}
                  </Link>
                  <p className="text-[11px] text-(--app-ink-3) truncate">
                    {u.username ? `@${u.username}` : `Level ${u.level}`} ·{" "}
                    {u.followersCount} followers
                  </p>
                </div>
                <FollowButton userId={u.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null,
    trending:
      trendingHashtags.length > 0 ? (
        <Card title="Trending Hashtags" icon={<Hash className="w-4 h-4 text-cyan-400" />}>
          <ul className="space-y-2">
            {trendingHashtags.map((h) => (
              <li key={h.tag} className="flex items-center justify-between">
                <Link
                  href={`/hashtag/${encodeURIComponent(h.tag.replace(/^#/, ""))}`}
                  className="text-sm font-semibold text-(--app-accent-ink) hover:text-(--app-accent-ink) hover:underline truncate min-w-0"
                >
                  {h.tag}
                </Link>
                {h.count > 0 && (
                  <span className="text-[11px] text-(--app-ink-3) tabular-nums shrink-0">
                    {h.count} posts
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null,
    promo: (
      <Link
        href={promo?.linkUrl || "/packages"}
        // The promo's gradient is ADMIN DATA, not a design choice: the owner
        // picks a from/to pair per campaign. When they have not, it falls back
        // to the app's one gradient rather than to a second hand-typed pair.
        className={cn(
          "app-press block rounded-(--app-r-card) p-(--app-pad) text-white",
          promo?.bgGradient ? "bg-linear-to-br" : "app-accent",
          promo?.bgGradient
        )}
      >
        <p className="t-eyebrow text-white/90">Promotion</p>
        <p className="t-section mt-1">
          {promo?.title ?? "Upgrade & earn more"}
        </p>
        <p className="text-xs opacity-90 mt-0.5">
          {promo?.subtitle ?? "Unlock higher rewards and referral levels."}
        </p>
        <span className="inline-block mt-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-[11px] font-semibold">
          Learn more →
        </span>
      </Link>
    ),
  };

  // Admin-created custom widgets, rendered by id from the order config.
  const renderCustom = (id: string): ReactNode => {
    const w = customWidgets.find((c) => c.id === id);
    if (!w) return null;
    if (w.kind === "links") {
      const links = w.links ?? [];
      if (!links.length) return null;
      return (
        <Card title={w.title}>
          <ul className="space-y-1.5">
            {links.map((l, i) => (
              <li key={i}>
                <Link
                  href={l.href}
                  className="block truncate text-sm font-semibold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      );
    }
    return (
      <Link
        href={w.href || "/packages"}
        // Same rule as the promo above: the gradient is the admin's, and the
        // fallback is the app's one gradient rather than a second literal.
        className={cn(
          "app-press block rounded-(--app-r-card) p-(--app-pad) text-white",
          w.gradient ? "bg-linear-to-br" : "app-accent",
          w.gradient
        )}
      >
        <p className="t-section">{w.title}</p>
        {w.subtitle && (
          <p className="t-meta opacity-90 mt-1">{w.subtitle}</p>
        )}
        <span className="app-tap-row inline-flex items-center mt-3 px-3.5 rounded-full bg-white/20 border border-white/40 text-[11px] font-extrabold">
          Learn more →
        </span>
      </Link>
    );
  };

  // The enabled widgets, in the admin's order, resolved to nodes and dropped
  // into their band. Order WITHIN a band is still exactly the admin's order —
  // grouping decides which heading a card sits under, not how the admin's
  // drag-and-drop is honoured.
  const banded = new Map<FeedWidgetGroup, { id: string; node: ReactNode }[]>();
  for (const w of widgetConfig) {
    if (!w.enabled) continue;
    const node = renderers[w.id] ?? renderCustom(w.id);
    if (!node) continue; // a widget with nothing to show contributes no heading
    const g = widgetGroupOf(w.id);
    const list = banded.get(g) ?? [];
    list.push({ id: w.id, node });
    banded.set(g, list);
  }

  return (
    <div className="space-y-3">
      {RAIL_GROUPS.map((g) => {
        const items = banded.get(g.id);
        // An empty band renders nothing at all — not a heading over a gap. This
        // matters most for "Sponsored": an ad-free user resolves that widget to
        // no node, and a lone "Sponsored" label above white space would be a
        // worse advert for the upgrade than the ad itself.
        if (!items || items.length === 0) return null;
        return (
          <RailGroup key={g.id} group={g} showHeading={showHeadings}>
            {items.map((it) => (
              <Fragment key={it.id}>{it.node}</Fragment>
            ))}
          </RailGroup>
        );
      })}

      {/* Footer links (always shown) */}
      {showFooter && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-(--app-ink-3)">
          <Link href="/privacy" className="hover:text-(--app-ink-2)">Privacy</Link>
          <Link href="/terms" className="hover:text-(--app-ink-2)">Terms</Link>
          <Link href="/refund" className="hover:text-(--app-ink-2)">Refunds</Link>
          <span>© {new Date().getFullYear()} EarnGPT</span>
        </div>
      )}
    </div>
  );
}

/**
 * Collapse state for the rail's bands.
 *
 * It is a module-level store read through `useSyncExternalStore` rather than
 * `useState` + an effect, for two reasons. The rail and the mobile sheet render
 * the same bands from the same definition, so both copies have to agree the
 * instant one of them is toggled — an effect-per-copy would leave the sheet
 * showing a band the rail had closed. And reading `localStorage` during render
 * would disagree with the server HTML: the third argument below is the server
 * snapshot, so every band hydrates OPEN and only then settles to what this
 * viewer chose, which is the direction that cannot hide a widget.
 */
const railBandListeners = new Set<() => void>();

function subscribeRailBands(cb: () => void): () => void {
  railBandListeners.add(cb);
  return () => {
    railBandListeners.delete(cb);
  };
}

function readBandCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Storage blocked (a private window) — the band stays open. That is the
    // safe default: a widget nobody can reopen is worse than one always shown.
    return false;
  }
}

function writeBandCollapsed(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* nothing to persist to — the toggle still works for this session */
  }
  for (const cb of railBandListeners) cb();
}

/**
 * One labelled band of the rail.
 *
 * The heading is a real 40px button, not a 20px caption with a chevron glued to
 * it — a `[&>button]` rule on a wrapper reaches DIRECT children only, and this
 * codebase has already shipped a 20px like target that way once.
 */
function RailGroup({
  group,
  showHeading,
  children,
}: {
  group: FeedWidgetGroupDef;
  showHeading: boolean;
  children: ReactNode;
}) {
  const storageKey = `feed.rail.collapsed.${group.id}`;
  const collapsed = useSyncExternalStore(
    subscribeRailBands,
    useCallback(
      () => (group.collapsible ? readBandCollapsed(storageKey) : false),
      [group.collapsible, storageKey]
    ),
    () => false
  );

  if (!showHeading) return <div className="space-y-3">{children}</div>;

  return (
    <section>
      {group.collapsible ? (
        <button
          type="button"
          onClick={() => writeBandCollapsed(storageKey, !collapsed)}
          aria-expanded={!collapsed}
          className="flex h-10 w-full items-center justify-between rounded-lg px-1 text-left text-[11px] font-bold uppercase tracking-wider text-(--app-ink-3) hover:text-(--app-ink)"
        >
          {group.label}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "-rotate-90"
            )}
            aria-hidden
          />
        </button>
      ) : (
        <p className="flex h-10 items-center px-1 text-[11px] font-bold uppercase tracking-wider text-(--app-ink-3)">
          {group.label}
        </p>
      )}
      {!collapsed && <div className="space-y-3">{children}</div>}
    </section>
  );
}
