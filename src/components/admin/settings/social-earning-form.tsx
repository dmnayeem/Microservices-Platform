"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Save,
  Loader2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  AtSign,
  Edit3,
  HandCoins,
  ListChecks,
  ShieldAlert,
  Target,
  ChevronDown,
  RotateCcw,
  TriangleAlert,
  Info,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/admin/shared/controls";

import {
  ratioPreview,
  type RatioWindow,
  type SocialActivityKey,
} from "@/lib/social-actions";

type ActivityKey = SocialActivityKey;

interface SideRow {
  enabled: boolean;
  points: number;
  xp: number;
  /** Award points+xp once per this many counted actions. 1 = per action. */
  perCount: number;
  /** When the counter resets: the paid user's local day, or never. */
  window: RatioWindow;
}

interface ActivityRow {
  recipient: SideRow;
  actor: SideRow;
}

/**
 * The POST body, field for field.
 *
 * Every key here is on the wire — snake_case at the top level, camelCase inside
 * a side — and the API validates the exact shape. Renaming anything, or letting
 * a key fall out of the object because its UI is hidden, changes what is
 * written to the database. See the note above `save()`.
 */
interface FormState {
  enabled: boolean;
  daily_cap_per_user: number;
  daily_xp_cap_per_user: number;
  cap_per_post: number;
  min_account_age_hours: number;
  count_toward_daily_missions: boolean;
  mission_distinct_post: boolean;
  activities: Record<ActivityKey, ActivityRow>;
}

interface Props {
  initial: FormState;
  canEdit: boolean;
}

const ACTIVITY_META: Record<
  ActivityKey,
  { label: string; icon: typeof Sparkles; example: string; actorLabel: string }
> = {
  post_create: {
    label: "Post created",
    icon: Edit3,
    example: "When the user publishes a post (max 1×/day)",
    actorLabel: "Self-action: actor & recipient are the same — only recipient pays out",
  },
  view_received: {
    label: "View received",
    icon: Eye,
    example: "When another user views the author's post",
    actorLabel: "Reward viewer (passive — keep off unless you want to pay scrolling)",
  },
  like_received: {
    label: "Like received",
    icon: Heart,
    example: "Each like on the author's post",
    actorLabel: "Reward the user who clicks Like",
  },
  vote_received: {
    label: "Vote received",
    icon: ListChecks,
    example: "Each vote on the author's poll (first time per voter)",
    actorLabel: "Reward the user who casts a vote",
  },
  comment_received: {
    label: "Comment received",
    icon: MessageCircle,
    example: "Each comment on the author's post",
    actorLabel: "Reward the user who posts a comment",
  },
  share_received: {
    label: "Share received",
    icon: Share2,
    example: "Each share of the author's post",
    actorLabel: "Reward the user who shares the post",
  },
  donation_received: {
    label: "Donation received",
    icon: HandCoins,
    example: "Bonus on top of donated points (donor pts already transfer)",
    actorLabel: "Bonus reward for the donor on top of the donation",
  },
  mention_received: {
    label: "Mention received",
    icon: AtSign,
    example: "Each time someone @mentions this user",
    actorLabel: "Reward the user who writes the @mention",
  },
};

/**
 * Display grouping only.
 *
 * These arrays drive the render order. `SOCIAL_ACTIVITY_KEYS` and
 * `SOCIAL_ACTIONS` in src/lib/social-actions.ts must NOT be reordered to match
 * a layout change: `ratioPreview` maps one to the other by array index, so a
 * reorder there silently mislabels every hint while everything else keeps
 * working. Change the display order here instead.
 */
const GROUPS: {
  id: string;
  label: string;
  blurb: string;
  keys: ActivityKey[];
}[] = [
  {
    id: "post",
    label: "Publishing",
    blurb: "Paid to the author for putting something on the feed.",
    keys: ["post_create"],
  },
  {
    id: "engagement",
    label: "Engagement",
    blurb:
      "Paid when a post is acted on. Repeats on the same post count once, so liking and unliking can't farm a ratio.",
    keys: [
      "view_received",
      "like_received",
      "vote_received",
      "comment_received",
      "share_received",
      "mention_received",
    ],
  },
  {
    id: "money",
    label: "Donations",
    blurb: "Bonus on top of points that already change hands.",
    keys: ["donation_received"],
  },
];

const TABS = [
  { id: "caps", label: "Caps & limits", icon: ShieldAlert },
  { id: "rates", label: "Activity rates", icon: Sparkles },
  { id: "missions", label: "Daily missions", icon: Target },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Field-level diff, so the footer can say how much is actually unsaved. */
function countChanges(a: FormState, b: FormState): number {
  let n = 0;
  const scalars = [
    "enabled",
    "daily_cap_per_user",
    "daily_xp_cap_per_user",
    "cap_per_post",
    "min_account_age_hours",
    "count_toward_daily_missions",
    "mission_distinct_post",
  ] as const;
  for (const k of scalars) if (a[k] !== b[k]) n++;
  for (const k of Object.keys(a.activities) as ActivityKey[]) {
    for (const side of ["recipient", "actor"] as const) {
      const x = a.activities[k][side];
      const y = b.activities[k]?.[side];
      if (!y) continue;
      if (x.enabled !== y.enabled) n++;
      if (x.points !== y.points) n++;
      if (x.xp !== y.xp) n++;
      if (x.perCount !== y.perCount) n++;
      if (x.window !== y.window) n++;
    }
  }
  return n;
}

/** One-line status for a collapsed activity row. */
function sideSummary(row: SideRow): string {
  if (!row.enabled) return "off";
  const bits: string[] = [];
  if (row.points > 0) bits.push(`+${row.points} pts`);
  if (row.xp > 0) bits.push(`+${row.xp} XP`);
  if (bits.length === 0) return "on, pays nothing";
  const reward = bits.join(" + ");
  return row.perCount > 1 ? `${reward} per ${row.perCount}` : reward;
}

export function SocialEarningForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  /**
   * What the database last confirmed. Compared against `form` to derive dirty
   * state rather than storing a boolean — a stored flag is one `setState` away
   * from lying, and this form has 82 controls that could set it.
   */
  const [baseline, setBaseline] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("rates");

  const changeCount = useMemo(
    () => countChanges(form, baseline),
    [form, baseline]
  );
  const dirty = changeCount > 0;

  // Live caps, so a reward that will be silently clipped is flagged as you type.
  const caps = {
    points: form.daily_cap_per_user,
    xp: form.daily_xp_cap_per_user,
    perPost: form.cap_per_post,
  };

  // Reload/close guard. Client-side navigation can't be intercepted from here,
  // so this covers refresh and tab-close only — switching tabs inside the form
  // loses nothing, since all three tabs read one `form` object.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const setRecipient = (k: ActivityKey, patch: Partial<SideRow>) =>
    setForm((p) => ({
      ...p,
      activities: {
        ...p.activities,
        [k]: {
          ...p.activities[k],
          recipient: { ...p.activities[k].recipient, ...patch },
        },
      },
    }));

  const setActor = (k: ActivityKey, patch: Partial<SideRow>) =>
    setForm((p) => ({
      ...p,
      activities: {
        ...p.activities,
        [k]: {
          ...p.activities[k],
          actor: { ...p.activities[k].actor, ...patch },
        },
      },
    }));

  /**
   * Posts `form` whole.
   *
   * Note what that means for `post_create`: its engager block has no UI, but
   * `activities.post_create.actor` is still in state and still sent, and the
   * API writes `post_create_actor_*` from whatever arrives. Dropping the hidden
   * object to "clean up" the payload would quietly rewrite those rows from
   * defaults. Hide UI, never state.
   */
  const save = async () => {
    setBusy(true);
    const payload = form;
    try {
      const res = await fetch("/api/admin/settings/social-earning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setBaseline(payload);
      toast.success("Social earning config saved");
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-400" />
          Social Earning
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Points and XP for social engagement. Every activity pays two sides
          independently: the <strong>author</strong> whose post received it, and
          the <strong>engager</strong> who performed it. The engager side ships
          switched off for every activity — turn it on per activity if you want
          to pay it.
        </p>
      </div>

      {/* Master switch */}
      <div className="mb-5">
        <Toggle
          tone={form.enabled ? "emerald" : "red"}
          checked={form.enabled}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, enabled: v })}
          label={
            <span className="inline-flex items-center gap-2 text-base font-bold">
              Social earning is{" "}
              <span
                className={form.enabled ? "text-emerald-400" : "text-red-400"}
              >
                {form.enabled ? "ON" : "OFF"}
              </span>
            </span>
          }
          description="Off = no points or XP fire from any social activity, whatever the rates below say."
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        {/* Tab strip */}
        <div
          role="tablist"
          aria-label="Social earning settings"
          className="border-b border-slate-800 flex gap-1 overflow-x-auto px-3 pt-3"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap inline-flex items-center gap-2 transition-colors",
                  active
                    ? "bg-slate-800 text-white border-b-2 border-blue-500 -mb-px"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-6">
          {tab === "caps" && (
            <div
              role="tabpanel"
              id="panel-caps"
              aria-labelledby="tab-caps"
              className="space-y-4"
            >
              <CapsPanel form={form} setForm={setForm} canEdit={canEdit} />
            </div>
          )}

          {tab === "rates" && (
            <div
              role="tabpanel"
              id="panel-rates"
              aria-labelledby="tab-rates"
              className="space-y-5"
            >
              <CapsBanner caps={caps} onEditCaps={() => setTab("caps")} />
              {GROUPS.map((g) => (
                <section key={g.id}>
                  <h2 className="text-xs uppercase tracking-wider text-slate-500 font-bold">
                    {g.label}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 mb-2">{g.blurb}</p>
                  <div className="space-y-2">
                    {g.keys.map((k) => (
                      <ActivityCard
                        key={k}
                        activity={k}
                        row={form.activities[k]}
                        canEdit={canEdit}
                        caps={caps}
                        onRecipient={(patch) => setRecipient(k, patch)}
                        onActor={(patch) => setActor(k, patch)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === "missions" && (
            <div
              role="tabpanel"
              id="panel-missions"
              aria-labelledby="tab-missions"
              className="space-y-3"
            >
              <MissionsPanel form={form} setForm={setForm} canEdit={canEdit} />
            </div>
          )}
        </div>

        {/* Footer action bar */}
        {canEdit && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-slate-800 bg-slate-900">
            <p
              className={cn(
                "text-sm",
                dirty ? "text-amber-300" : "text-slate-500"
              )}
            >
              {dirty
                ? `${changeCount} unsaved ${changeCount === 1 ? "change" : "changes"}`
                : "All changes saved"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm(baseline)}
                disabled={!dirty || busy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" />
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── Caps ────────────────────────────── */

/**
 * The zero warnings here are not cosmetic. The engine treats 0 differently per
 * cap, and two of the three mean "pay nothing" rather than "no limit":
 *   - daily points cap 0 → `Math.max(0, 0 - todayPoints)` clamps every payout to 0
 *   - per-post cap 0     → `postEarned >= 0` is true immediately, so recipients earn nothing
 *   - daily XP cap 0     → guarded with `> 0`, so this one really is unlimited
 * An admin typing 0 for "unlimited" would switch off all social points.
 */
function CapsPanel({
  form,
  setForm,
  canEdit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  canEdit: boolean;
}) {
  // Narrowed to the four integer keys so a future edit can't point this at
  // `activities` and replace the whole object with a number.
  type CapKey =
    | "daily_cap_per_user"
    | "daily_xp_cap_per_user"
    | "cap_per_post"
    | "min_account_age_hours";
  const setInt = (k: CapKey, v: string) =>
    setForm((p) => ({ ...p, [k]: Math.max(0, parseInt(v) || 0) }));

  return (
    <>
      <p className="text-sm text-slate-400">
        Hard limits that stop viral content or a bad rate from draining the
        treasury. The two daily caps reset at the earning user&apos;s local
        midnight.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NumberField
          id="cap-daily-points"
          label="Daily points cap"
          hint="Most social points one user can earn in a day"
          value={form.daily_cap_per_user}
          disabled={!canEdit}
          onChange={(v) => setInt("daily_cap_per_user", v)}
          danger={
            form.daily_cap_per_user === 0
              ? "0 does not mean unlimited — it blocks every social point payout. For effectively no limit, enter a large number."
              : undefined
          }
        />
        <NumberField
          id="cap-daily-xp"
          label="Daily XP cap"
          hint="Most social XP one user can earn in a day"
          value={form.daily_xp_cap_per_user}
          disabled={!canEdit}
          onChange={(v) => setInt("daily_xp_cap_per_user", v)}
          note={
            form.daily_xp_cap_per_user === 0
              ? "0 here means no XP limit at all."
              : undefined
          }
        />
        <NumberField
          id="cap-per-post"
          label="Max points per post"
          hint="Ceiling on what one post can earn its author, all-time"
          value={form.cap_per_post}
          disabled={!canEdit}
          onChange={(v) => setInt("cap_per_post", v)}
          danger={
            form.cap_per_post === 0
              ? "0 does not mean unlimited — an author earns nothing from any post. For effectively no limit, enter a large number."
              : undefined
          }
        />
        <NumberField
          id="cap-account-age"
          label="Minimum account age (hours)"
          hint="Brand-new accounts earn nothing until this old"
          value={form.min_account_age_hours}
          disabled={!canEdit}
          onChange={(v) => setInt("min_account_age_hours", v)}
          note={
            form.min_account_age_hours === 0
              ? "0 lets an account earn the second it is created."
              : undefined
          }
        />
      </div>

      <p className="text-xs text-slate-500">
        The per-post cap applies to the author only, and only to rewards tied to
        a specific post. A ratio reward (&quot;per 100 likes&quot;) is earned
        across all their posts at once, so only the daily cap limits it.
      </p>
    </>
  );
}

/** Read-only reminder of the caps every warning on the Rates tab refers to. */
function CapsBanner({
  caps,
  onEditCaps,
}: {
  caps: { points: number; xp: number; perPost: number };
  onEditCaps: () => void;
}) {
  const zeroed = caps.points === 0 || caps.perPost === 0;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs",
        zeroed
          ? "border-red-500/30 bg-red-500/10 text-red-200"
          : "border-slate-800 bg-slate-950/50 text-slate-400"
      )}
    >
      {zeroed ? (
        <TriangleAlert className="w-4 h-4 shrink-0 text-red-300" />
      ) : (
        <Info className="w-4 h-4 shrink-0 text-slate-500" />
      )}
      <span>
        Current caps: <strong>{caps.points}</strong> pts/day ·{" "}
        <strong>{caps.xp}</strong> XP/day · <strong>{caps.perPost}</strong> pts
        per post
        {zeroed && " — a cap of 0 blocks payouts entirely."}
      </span>
      <button
        type="button"
        onClick={onEditCaps}
        className="underline hover:text-white"
      >
        Change caps
      </button>
    </div>
  );
}

/* ──────────────────────────── Activities ─────────────────────────── */

function ActivityCard({
  activity,
  row,
  canEdit,
  caps,
  onRecipient,
  onActor,
}: {
  activity: ActivityKey;
  row: ActivityRow;
  canEdit: boolean;
  caps: { points: number; xp: number; perPost: number };
  onRecipient: (patch: Partial<SideRow>) => void;
  onActor: (patch: Partial<SideRow>) => void;
}) {
  const meta = ACTIVITY_META[activity];
  const Icon = meta.icon;
  const isPostCreate = activity === "post_create";
  const live = row.recipient.enabled || row.actor.enabled;

  // Computed once, from the values the page loaded with, so React never
  // re-applies `open` and fights an admin who collapsed a row by hand.
  const [defaultOpen] = useState(
    () => row.recipient.enabled || row.actor.enabled
  );

  const viewRatio =
    activity === "view_received" &&
    (row.recipient.perCount > 1 || row.actor.perCount > 1);

  return (
    <details
      open={defaultOpen || undefined}
      className={cn(
        "group rounded-lg border overflow-hidden",
        live ? "border-slate-700 bg-slate-950" : "border-slate-800 bg-slate-900/30"
      )}
    >
      <summary className="cursor-pointer list-none select-none px-3 py-2.5 flex items-center gap-3 hover:bg-slate-800/40 transition-colors [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            "p-2 rounded-lg shrink-0",
            live
              ? "bg-blue-500/10 text-blue-400"
              : "bg-slate-800 text-slate-500"
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white">
            {meta.label}
          </span>
          <span className="block text-xs text-slate-500 truncate">
            Author: {sideSummary(row.recipient)}
            {!isPostCreate && <> · Engager: {sideSummary(row.actor)}</>}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-slate-800 p-3 space-y-3">
        <p className="text-xs text-slate-500">{meta.example}</p>

        <SideBlock
          title="Author earns — when their post receives this"
          side="recipient"
          activity={activity}
          row={row.recipient}
          canEdit={canEdit}
          caps={caps}
          onChange={onRecipient}
        />

        {isPostCreate ? (
          <p className="text-xs text-slate-500 italic px-1">
            {meta.actorLabel}
          </p>
        ) : (
          <SideBlock
            title="Engager earns — when they perform this"
            side="actor"
            activity={activity}
            row={row.actor}
            canEdit={canEdit}
            caps={caps}
            onChange={onActor}
          />
        )}

        {viewRatio && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg p-2.5">
            A ratio on views makes the platform log <em>every post view</em> —
            the highest-volume event there is. Check your log retention before
            leaving this on.
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * One side of one activity: the switch, the numbers, a plain-English summary of
 * what they will actually do, and the warnings that stop an admin configuring
 * something that silently pays nothing.
 */
function SideBlock({
  title,
  side,
  activity,
  row,
  canEdit,
  caps,
  onChange,
}: {
  title: string;
  side: "recipient" | "actor";
  activity: ActivityKey;
  row: SideRow;
  canEdit: boolean;
  caps: { points: number; xp: number; perPost: number };
  onChange: (patch: Partial<SideRow>) => void;
}) {
  const uid = `${activity}-${side}`;
  const isRatio = row.enabled && row.perCount > 1;
  // POST_CREATE's ledger reference is already keyed to one per local day, so a
  // daily window there would be meaningless.
  const forceLifetime = activity === "post_create";

  // These used to require `perCount > 1`, so a flat reward — the shipped
  // default for every activity — could sit far above the cap with no warning at
  // all, even though the engine clips it exactly the same way. The cap-of-0
  // case is left to the banner rather than repeated on all sixteen sides.
  const capped = row.enabled && caps.points > 0;
  const overPoints = capped && row.points > caps.points;
  const nearPoints = capped && !overPoints && row.points > caps.points / 2;
  const overXp = row.enabled && caps.xp > 0 && row.xp > caps.xp;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        row.enabled
          ? "border-slate-700 bg-slate-900/60"
          : "border-slate-800 bg-slate-900/20"
      )}
    >
      <Toggle
        tone={row.enabled ? "emerald" : "blue"}
        checked={row.enabled}
        disabled={!canEdit}
        onChange={(v) => onChange({ enabled: v })}
        label={title}
        description={row.enabled ? undefined : "Currently pays nothing."}
      />

      {/* Inputs are hidden when the side is off, never removed from `form` —
          the whole object is posted either way. */}
      {row.enabled && (
        <>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <NumberField
              id={`${uid}-points`}
              label="Points"
              hint="Per payout"
              value={row.points}
              disabled={!canEdit}
              float
              onChange={(v) =>
                onChange({ points: Math.max(0, parseFloat(v) || 0) })
              }
            />
            <NumberField
              id={`${uid}-xp`}
              label="XP"
              hint="Per payout"
              value={row.xp}
              disabled={!canEdit}
              float
              onChange={(v) => onChange({ xp: Math.max(0, parseFloat(v) || 0) })}
            />
            <NumberField
              id={`${uid}-per`}
              label="Pay once per"
              hint="1 = every time"
              min={1}
              value={row.perCount}
              disabled={!canEdit}
              onChange={(v) =>
                onChange({ perCount: Math.max(1, parseInt(v) || 1) })
              }
            />
            <div>
              <label
                htmlFor={`${uid}-window`}
                className="block text-xs font-medium text-slate-400 mb-1.5"
              >
                Counter resets
                <span className="text-slate-600 ml-1">
                  ·{" "}
                  {forceLifetime
                    ? "n/a here"
                    : row.perCount <= 1
                      ? "needs Pay once per > 1"
                      : "when the tally clears"}
                </span>
              </label>
              <select
                id={`${uid}-window`}
                value={forceLifetime ? "lifetime" : row.window}
                onChange={(e) =>
                  onChange({ window: e.target.value as RatioWindow })
                }
                disabled={!canEdit || row.perCount <= 1 || forceLifetime}
                className={inp}
              >
                <option value="daily" className="bg-slate-900">
                  Every day
                </option>
                <option value="lifetime" className="bg-slate-900">
                  Never (all time)
                </option>
              </select>
            </div>
          </div>

          <p className="mt-2.5 text-xs text-emerald-300/90">
            {ratioPreview(activity, side, row)}
          </p>

          {overPoints && (
            <p className="mt-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
              {isRatio ? (
                <>
                  +{row.points} pts is above the {caps.points} pts/day cap — the
                  payout is clipped to the cap{" "}
                  <strong>and the milestone is still used up</strong>. Raise the
                  daily cap or lower the reward.
                </>
              ) : (
                <>
                  +{row.points} pts is above the {caps.points} pts/day cap — the
                  first one a user earns is clipped to the cap and everything
                  after it pays nothing until their day resets.
                </>
              )}
            </p>
          )}
          {nearPoints && (
            <p className="mt-1.5 text-xs text-slate-400">
              +{row.points} pts is more than half the {caps.points} pts/day cap
              — a user can only hit this about twice a day.
            </p>
          )}
          {overXp && (
            <p className="mt-1.5 text-xs text-amber-300">
              +{row.xp} XP is above the {caps.xp} XP/day cap and will be clipped.
            </p>
          )}
          {side === "recipient" && isRatio && (
            <p className="mt-1.5 text-xs text-slate-500">
              Earned across all the author&apos;s posts, so &quot;Max points per
              post&quot; ({caps.perPost}) does not limit it — only the daily cap
              does.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ──────────────────────────── Missions ─────────────────────────── */

function MissionsPanel({
  form,
  setForm,
  canEdit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  canEdit: boolean;
}) {
  return (
    <>
      <p className="text-sm text-slate-400">
        Let social actions count toward daily missions. Mission templates can
        then use the task types{" "}
        {["SOCIAL_LIKE", "SOCIAL_COMMENT", "SOCIAL_SHARE", "SOCIAL_POST", "SOCIAL_VOTE"].map(
          (t, i, arr) => (
            <span key={t}>
              <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-xs">
                {t}
              </code>
              {i < arr.length - 1 ? ", " : "."}
            </span>
          )
        )}
      </p>

      <Toggle
        tone="purple"
        checked={form.count_toward_daily_missions}
        disabled={!canEdit}
        onChange={(v) =>
          setForm((p) => ({ ...p, count_toward_daily_missions: v }))
        }
        label="Count social actions toward missions"
        description="Each like, comment, share, vote or post the user makes is logged for that day's mission progress."
      />

      <Toggle
        tone="purple"
        checked={form.mission_distinct_post}
        disabled={!canEdit || !form.count_toward_daily_missions}
        onChange={(v) => setForm((p) => ({ ...p, mission_distinct_post: v }))}
        label="Count distinct posts only (anti-spam)"
        description="5 likes on 5 different posts count as 5; 5 likes on the same post count as 1. Recommended on."
      />

      {!form.count_toward_daily_missions && (
        <p className="text-xs text-slate-500 px-1">
          The anti-spam rule only applies while the switch above is on.
        </p>
      )}
    </>
  );
}

/* ───────────────────────────── Fields ───────────────────────────── */

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white tabular-nums focus:outline-none focus:border-blue-500 disabled:opacity-60";

/**
 * `float` matters: the API types points and xp as `z.number()` rather than
 * `.int()`, so fractional rewards are legal there and must not be rounded on
 * the way in. Every cap, by contrast, is `.int()`.
 */
function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  min = 0,
  float = false,
  note,
  danger,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (raw: string) => void;
  disabled?: boolean;
  min?: number;
  float?: boolean;
  note?: string;
  danger?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-slate-400 mb-1.5"
      >
        {label}
        {hint && <span className="text-slate-600 ml-1">· {hint}</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode={float ? "decimal" : "numeric"}
        min={min}
        step={float ? "any" : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={danger ? `${id}-danger` : note ? `${id}-note` : undefined}
        className={cn(inp, danger && "border-red-500/50")}
      />
      {danger && (
        <p
          id={`${id}-danger`}
          className="mt-1.5 text-xs text-red-300 inline-flex items-start gap-1.5"
        >
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {danger}
        </p>
      )}
      {!danger && note && (
        <p id={`${id}-note`} className="mt-1.5 text-xs text-slate-500">
          {note}
        </p>
      )}
    </div>
  );
}
