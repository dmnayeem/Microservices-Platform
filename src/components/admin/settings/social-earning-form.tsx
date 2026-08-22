"use client";

import { useState } from "react";
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
  Power,
  ShieldAlert,
  Target,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

export function SocialEarningForm({ initial, canEdit }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  // Live caps, so a reward that will be silently clipped is flagged as you type.
  const caps = {
    points: form.daily_cap_per_user,
    xp: form.daily_xp_cap_per_user,
    perPost: form.cap_per_post,
  };

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

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings/social-earning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-400" />
          Social Earning
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Points and XP for social engagement. Every activity pays two sides
          independently: the <strong>author</strong> whose post received it, and
          the <strong>engager</strong> who performed it. Set{" "}
          <strong>Per</strong> above 1 to pay once per that many actions instead
          of every time — e.g. Per 100 with 10 points means &quot;100 likes → 10
          points&quot;. The engager side ships off.
        </p>
      </div>

      {/* Master switch */}
      <div
        className={cn(
          "rounded-xl border p-5",
          form.enabled
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-slate-700 bg-slate-900"
        )}
      >
        <label className="flex items-center gap-4 cursor-pointer">
          <Power
            className={cn(
              "w-6 h-6",
              form.enabled ? "text-emerald-400" : "text-slate-500"
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white">
              Master Switch — Social Earning is{" "}
              <span
                className={cn(
                  form.enabled ? "text-emerald-400" : "text-red-400"
                )}
              >
                {form.enabled ? "ENABLED" : "DISABLED"}
              </span>
            </p>
            <p className="text-xs text-slate-400">
              Off = no points or XP fire from any social activity, regardless
              of the per-activity rates below.
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            disabled={!canEdit}
            className="w-5 h-5 rounded bg-slate-800 border-slate-600 text-emerald-500"
          />
        </label>
      </div>

      {/* Per-activity grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-base font-bold text-white mb-1">
          Per-activity rates
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Each activity pays the author and the engager separately. Repeats on
          the same post count once, so nobody can farm a ratio by liking and
          unliking.
        </p>
        <div className="space-y-2">
          {(Object.keys(ACTIVITY_META) as ActivityKey[]).map((k) => {
            const meta = ACTIVITY_META[k];
            const row = form.activities[k];
            const Icon = meta.icon;
            const isPostCreate = k === "post_create";
            return (
              <div
                key={k}
                className={cn(
                  "rounded-lg border p-3 transition-colors",
                  row.recipient.enabled || row.actor.enabled
                    ? "border-slate-700 bg-slate-950"
                    : "border-slate-800 bg-slate-900/30 opacity-70"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{meta.label}</p>
                    <p className="text-[11px] text-slate-500">{meta.example}</p>
                  </div>
                </div>

                {/* Both sides are always visible. The actor side used to be
                    behind a collapsed "Actor reward" toggle, which is why the
                    ratio field looked like it didn't exist. */}
                <SideBlock
                  title="Author earns — when their post RECEIVES this"
                  side="recipient"
                  activity={k}
                  row={row.recipient}
                  canEdit={canEdit}
                  caps={caps}
                  onChange={(patch) => setRecipient(k, patch)}
                />

                {isPostCreate ? (
                  <p className="mt-2 text-[11px] text-slate-500 italic">
                    {meta.actorLabel}
                  </p>
                ) : (
                  <SideBlock
                    title="Engager earns — when they PERFORM this"
                    side="actor"
                    activity={k}
                    row={row.actor}
                    canEdit={canEdit}
                    caps={caps}
                    onChange={(patch) => setActor(k, patch)}
                  />
                )}

                {k === "view_received" &&
                  (row.recipient.perCount > 1 || row.actor.perCount > 1) && (
                    <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded p-2">
                      A ratio on views makes the platform log <em>every post
                      view</em> — the highest-volume event there is. Check your
                      log retention before leaving this on.
                    </p>
                  )}

              </div>
            );
          })}
        </div>
      </div>

      {/* Caps */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h2 className="text-base font-bold text-white mb-1 inline-flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          Anti-abuse caps
        </h2>
        <p className="text-xs text-amber-200/80 mb-4">
          Hard limits to prevent gaming the system or runaway points from
          viral content. Caps apply per user per UTC day.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Daily points cap (per user)" hint="Max social pts/day">
            <input
              type="number"
              min={0}
              value={form.daily_cap_per_user}
              onChange={(e) =>
                setForm({
                  ...form,
                  daily_cap_per_user: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field label="Daily XP cap (per user)" hint="Max social XP/day">
            <input
              type="number"
              min={0}
              value={form.daily_xp_cap_per_user}
              onChange={(e) =>
                setForm({
                  ...form,
                  daily_xp_cap_per_user: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field label="Max points per post" hint="Cap recipient earnings on a single post">
            <input
              type="number"
              min={0}
              value={form.cap_per_post}
              onChange={(e) =>
                setForm({
                  ...form,
                  cap_per_post: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
          <Field label="Min account age (hours)" hint="Brand-new accounts can't earn">
            <input
              type="number"
              min={0}
              value={form.min_account_age_hours}
              onChange={(e) =>
                setForm({
                  ...form,
                  min_account_age_hours: Math.max(
                    0,
                    parseInt(e.target.value) || 0
                  ),
                })
              }
              disabled={!canEdit}
              className={inp}
            />
          </Field>
        </div>
      </div>

      {/* Daily mission integration */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
        <h2 className="text-base font-bold text-white mb-1 inline-flex items-center gap-2">
          <Target className="w-4 h-4 text-indigo-400" />
          Daily mission integration
        </h2>
        <p className="text-xs text-indigo-200/80 mb-4">
          Let social actions count toward daily missions. Mission templates
          can use task types <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">SOCIAL_LIKE</code>,{" "}
          <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">SOCIAL_COMMENT</code>,{" "}
          <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">SOCIAL_SHARE</code>,{" "}
          <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">SOCIAL_POST</code>,{" "}
          <code className="px-1 py-0.5 rounded bg-slate-800 text-slate-200">SOCIAL_VOTE</code>.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-950 border border-slate-800">
            <input
              type="checkbox"
              checked={form.count_toward_daily_missions}
              onChange={(e) =>
                setForm({ ...form, count_toward_daily_missions: e.target.checked })
              }
              disabled={!canEdit}
              className="rounded bg-slate-800 border-slate-600 text-indigo-500"
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                Count social actions toward missions
              </p>
              <p className="text-[11px] text-slate-500">
                When enabled, each like/comment/share/post the user makes is
                logged for the day&apos;s mission progress.
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg bg-slate-950 border border-slate-800">
            <input
              type="checkbox"
              checked={form.mission_distinct_post}
              onChange={(e) =>
                setForm({ ...form, mission_distinct_post: e.target.checked })
              }
              disabled={!canEdit || !form.count_toward_daily_missions}
              className="rounded bg-slate-800 border-slate-600 text-indigo-500"
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">
                Count distinct posts only (anti-spam)
              </p>
              <p className="text-[11px] text-slate-500">
                e.g. 5 likes on 5 different posts count as 5; 5 likes on the
                same post count as 1. Recommended on.
              </p>
            </div>
          </label>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Configuration
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One side of one activity: the controls, a plain-English summary of what they
 * will actually do, and the warnings that stop an admin configuring something
 * that silently pays nothing.
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
  const isRatio = row.enabled && row.perCount > 1;
  // POST_CREATE's ledger reference is already keyed to one per local day, so a
  // daily window there would be meaningless.
  const forceLifetime = activity === "post_create";

  const overPoints = isRatio && row.points > caps.points;
  const overXp = isRatio && row.xp > caps.xp;
  const nearPoints = isRatio && !overPoints && row.points > caps.points / 2;

  return (
    <div className="mt-3 rounded-lg bg-slate-900/60 border border-slate-800 p-2.5">
      <p className="text-[11px] font-bold text-slate-300 mb-1.5">{title}</p>

      <SideControls
        side={side}
        row={row}
        canEdit={canEdit}
        forceLifetime={forceLifetime}
        onChange={onChange}
      />

      <p className="mt-1.5 text-[11px] text-emerald-300/80">
        {ratioPreview(activity, side, row)}
      </p>

      {overPoints && (
        <p className="mt-1 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-1">
          +{row.points} pts is above the {caps.points} pts/day cap — the payout
          will be clipped to the cap <strong>and the milestone is still used
          up</strong>. Raise the daily cap or lower the reward.
        </p>
      )}
      {nearPoints && (
        <p className="mt-1 text-[11px] text-slate-400">
          +{row.points} pts is more than half the {caps.points} pts/day cap — a
          user can only hit this about twice a day.
        </p>
      )}
      {overXp && (
        <p className="mt-1 text-[11px] text-amber-300">
          +{row.xp} XP is above the {caps.xp} XP/day cap and will be clipped.
        </p>
      )}
      {side === "recipient" && isRatio && (
        <p className="mt-1 text-[11px] text-slate-500">
          Earned across all the author&apos;s posts, so &quot;Max points per
          post&quot; ({caps.perPost}) does not limit it — only the daily cap does.
        </p>
      )}
    </div>
  );
}

function SideControls({
  side,
  row,
  canEdit,
  forceLifetime = false,
  onChange,
}: {
  side: "recipient" | "actor";
  row: SideRow;
  canEdit: boolean;
  /** post_create pays once per day already — a daily window means nothing. */
  forceLifetime?: boolean;
  onChange: (patch: Partial<SideRow>) => void;
}) {
  const off = !canEdit || !row.enabled;
  const inputCls =
    "flex-1 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-sm text-white tabular-nums focus:outline-none focus:border-blue-500 disabled:opacity-60";
  const cellCls =
    "flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800";

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      <label className={cn(cellCls, "cursor-pointer")}>
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          disabled={!canEdit}
          className="rounded bg-slate-800 border-slate-600 text-blue-500"
        />
        <span className="text-[11px] text-slate-300 capitalize">
          {side === "recipient" ? "On" : "On"}
        </span>
      </label>

      <div className={cellCls}>
        <span
          className="text-[11px] text-slate-400 w-10 shrink-0"
          title="1 = pay on every action. Higher = pay once per this many actions."
        >
          Per
        </span>
        <input
          type="number"
          min={1}
          step={1}
          value={row.perCount}
          onChange={(e) =>
            onChange({ perCount: Math.max(1, parseInt(e.target.value) || 1) })
          }
          disabled={off}
          className={inputCls}
        />
      </div>

      <div className={cellCls}>
        <span className="text-[11px] text-slate-400 w-10 shrink-0">Resets</span>
        <select
          value={forceLifetime ? "lifetime" : row.window}
          onChange={(e) => onChange({ window: e.target.value as RatioWindow })}
          disabled={off || row.perCount <= 1 || forceLifetime}
          title={
            forceLifetime
              ? "Posting already pays at most once per day."
              : row.perCount <= 1
                ? "Only applies when Per is above 1."
                : undefined
          }
          className={inputCls}
        >
          <option value="daily" className="bg-slate-900">
            Daily
          </option>
          <option value="lifetime" className="bg-slate-900">
            All time
          </option>
        </select>
      </div>

      <div className={cellCls}>
        <span className="text-[11px] text-slate-400 w-10 shrink-0">Points</span>
        <input
          type="number"
          min={0}
          step={1}
          value={row.points}
          onChange={(e) =>
            onChange({ points: Math.max(0, parseFloat(e.target.value) || 0) })
          }
          disabled={off}
          className={inputCls}
        />
      </div>

      <div className={cellCls}>
        <span className="text-[11px] text-slate-400 w-10 shrink-0">XP</span>
        <input
          type="number"
          min={0}
          step={1}
          value={row.xp}
          onChange={(e) =>
            onChange({ xp: Math.max(0, parseFloat(e.target.value) || 0) })
          }
          disabled={off}
          className={inputCls}
        />
      </div>
    </div>
  );
}


const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
        {hint && <span className="text-slate-600 ml-1">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
