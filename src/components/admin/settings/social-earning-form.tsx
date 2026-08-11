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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ActivityKey =
  | "post_create"
  | "view_received"
  | "like_received"
  | "vote_received"
  | "comment_received"
  | "share_received"
  | "donation_received"
  | "mention_received";

interface SideRow {
  enabled: boolean;
  points: number;
  xp: number;
  /** Actor side (like/comment): award `points` once per this many distinct-post
   *  actions (lifetime). 1 = per action. */
  perCount?: number;
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
  const [openActor, setOpenActor] = useState<Record<ActivityKey, boolean>>(
    () =>
      Object.fromEntries(
        (Object.keys(ACTIVITY_META) as ActivityKey[]).map((k) => [
          k,
          initial.activities[k]?.actor.enabled ?? false,
        ])
      ) as Record<ActivityKey, boolean>
  );

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
          Configure points and XP awarded for social engagement. Each action has
          two payout sides: the <strong>recipient</strong> (post author) and the{" "}
          <strong>actor</strong> (the user who performed the action). Actor side
          ships disabled — turn it on per-action when you want to reward
          engagement on top of receiving it.
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
          Each activity has separate rates for the recipient and the actor.
          Click &quot;Actor reward&quot; to expand the actor controls per row.
        </p>
        <div className="space-y-2">
          {(Object.keys(ACTIVITY_META) as ActivityKey[]).map((k) => {
            const meta = ACTIVITY_META[k];
            const row = form.activities[k];
            const Icon = meta.icon;
            const actorOpen = openActor[k];
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

                {/* Recipient controls */}
                <SideControls
                  side="recipient"
                  row={row.recipient}
                  canEdit={canEdit}
                  onChange={(patch) => setRecipient(k, patch)}
                />

                {/* Actor controls — collapsible (hidden entirely for POST_CREATE since actor === recipient) */}
                {!isPostCreate && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenActor((p) => ({ ...p, [k]: !p[k] }))
                      }
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                    >
                      {actorOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      Actor reward
                      {row.actor.enabled && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">
                          ON
                        </span>
                      )}
                    </button>
                    {actorOpen && (
                      <div className="mt-2 ml-7 pl-3 border-l-2 border-slate-800">
                        <p className="text-[11px] text-slate-500 mb-1">
                          {meta.actorLabel}
                        </p>
                        <SideControls
                          side="actor"
                          row={row.actor}
                          canEdit={canEdit}
                          onChange={(patch) => setActor(k, patch)}
                          showPerCount={
                            k === "like_received" || k === "comment_received"
                          }
                        />
                        {(k === "like_received" || k === "comment_received") &&
                          row.actor.enabled &&
                          (row.actor.perCount ?? 1) > 1 && (
                            <p className="mt-1 ml-11 text-[11px] text-emerald-300/80">
                              Every {row.actor.perCount} distinct posts{" "}
                              {k === "like_received" ? "liked" : "commented on"} →
                              +{row.actor.points} pts (lifetime).
                            </p>
                          )}
                      </div>
                    )}
                  </>
                )}
                {isPostCreate && (
                  <p className="mt-2 ml-11 text-[11px] text-slate-500 italic">
                    {meta.actorLabel}
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

function SideControls({
  side,
  row,
  canEdit,
  onChange,
  showPerCount = false,
}: {
  side: "recipient" | "actor";
  row: SideRow;
  canEdit: boolean;
  onChange: (patch: Partial<SideRow>) => void;
  /** Actor like/comment: show the "Per (count)" milestone divisor. */
  showPerCount?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-2 ml-11 grid grid-cols-1 gap-2",
        showPerCount ? "sm:grid-cols-4" : "sm:grid-cols-3"
      )}
    >
      <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          disabled={!canEdit}
          className="rounded bg-slate-800 border-slate-600 text-blue-500"
        />
        <span className="text-[11px] text-slate-300 capitalize">
          {side} enabled
        </span>
      </label>
      {showPerCount && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-[11px] text-slate-400 w-16 shrink-0" title="Award points once per this many distinct posts">
            Per
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={row.perCount ?? 1}
            onChange={(e) =>
              onChange({ perCount: Math.max(1, parseInt(e.target.value) || 1) })
            }
            disabled={!canEdit || !row.enabled}
            className="flex-1 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-sm text-white tabular-nums focus:outline-none focus:border-blue-500 disabled:opacity-60"
          />
        </div>
      )}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
        <span className="text-[11px] text-slate-400 w-16 shrink-0">Points</span>
        <input
          type="number"
          min={0}
          step={1}
          value={row.points}
          onChange={(e) =>
            onChange({ points: Math.max(0, parseFloat(e.target.value) || 0) })
          }
          disabled={!canEdit || !row.enabled}
          className="flex-1 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-sm text-white tabular-nums focus:outline-none focus:border-blue-500 disabled:opacity-60"
        />
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
        <span className="text-[11px] text-slate-400 w-16 shrink-0">XP</span>
        <input
          type="number"
          min={0}
          step={1}
          value={row.xp}
          onChange={(e) =>
            onChange({ xp: Math.max(0, parseFloat(e.target.value) || 0) })
          }
          disabled={!canEdit || !row.enabled}
          className="flex-1 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-sm text-white tabular-nums focus:outline-none focus:border-blue-500 disabled:opacity-60"
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
