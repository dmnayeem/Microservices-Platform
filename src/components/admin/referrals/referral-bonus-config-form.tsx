"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, Plus, X, ArrowRight } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  REFERRAL_BONUS_DEFAULTS,
  newMilestoneId,
  type ReferralBonusConfig,
  type ReferralMilestone,
} from "@/lib/referral-config";

/**
 * Every referral reward, on the referral page, in one form.
 *
 * The platform runs five referral models and they were scattered: sign-up and
 * subscription bonuses here, the multi-tier commission on a separate Levels
 * page, and two models — the invitee's half of a two-way offer, and milestones
 * — that did not exist at all. An admin could not see what the referral
 * programme currently WAS without opening two screens and reading code.
 *
 * Each model gets its own switch. Turning the master switch off stops all of
 * them; the multi-tier commission is separate and keeps its own page, because
 * it is a per-level table rather than a single amount.
 */
export function ReferralBonusConfigForm({
  initial,
  packages = [],
}: {
  initial: ReferralBonusConfig;
  /** Plans a milestone can hand out, for the subscription reward. */
  packages?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<ReferralBonusConfig>({
    ...REFERRAL_BONUS_DEFAULTS,
    ...initial,
  });
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ReferralBonusConfig>(
    k: K,
    v: ReferralBonusConfig[K]
  ) => setCfg((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "referral",
          settings: { referral_bonus_config: cfg },
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error ?? `HTTP ${res.status}`);
      }
      toast.success("Referral settings saved");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the settings"
      );
    } finally {
      setBusy(false);
    }
  };

  const inp =
    "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none";

  const addMilestone = () =>
    set("milestones", [
      ...cfg.milestones,
      {
        // A fresh, stable identity. The payout reference is keyed on this and
        // not on the threshold, so editing "10 referrals" to "12" later is an
        // edit of the same step rather than a brand-new one that re-pays
        // everybody who already passed it.
        id: newMilestoneId(),
        referrals: 0,
        rewardType: "POINTS",
        points: 0,
        packageId: packages[0]?.id ?? "",
        months: 1,
        label: "",
      },
    ]);
  const setMilestone = (i: number, patch: Partial<ReferralMilestone>) =>
    set(
      "milestones",
      cfg.milestones.map((m, x) => (x === i ? { ...m, ...patch } : m))
    );
  const dropMilestone = (i: number) =>
    set(
      "milestones",
      cfg.milestones.filter((_, x) => x !== i)
    );

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">Referral rewards</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every model, with its own switch. Amounts are in points.
          </p>
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>
      </div>

      {/* Master switch. Everything below is dead while this is off, so it says
          so rather than letting an admin tune numbers that cannot apply. */}
      <Switch
        label="Referral rewards are ON"
        description="The master switch for every bonus on this page. The multi-tier commission has its own switch per level."
        checked={cfg.enabled}
        onChange={(v) => set("enabled", v)}
        tone="amber"
      />

      <div className={cn("space-y-3", !cfg.enabled && "opacity-50")}>
        <Model
          n={1}
          title="Two-way — both sides get paid"
          blurb="The model most platforms use: “you get 100, your friend gets 100”. It works because both sides have a reason to act — paying only the referrer gives the person signing up no reason to use a link."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch
              label="Pay the referrer on sign-up"
              checked={cfg.signupEnabled}
              onChange={(v) => set("signupEnabled", v)}
            />
            <Num
              label="Referrer gets"
              value={cfg.signupPoints}
              onChange={(v) => set("signupPoints", v)}
              cls={inp}
            />
            <Switch
              label="Pay the NEW USER too"
              checked={cfg.inviteeEnabled}
              onChange={(v) => set("inviteeEnabled", v)}
            />
            <Num
              label="New user gets"
              value={cfg.inviteePoints}
              onChange={(v) => set("inviteePoints", v)}
              cls={inp}
            />
          </div>
          <Switch
            label="Withhold the new user's half if the referrer is inactive"
            description="Off by default: the invitee did nothing wrong, and withholding it removes the very incentive that makes them sign up."
            checked={cfg.inviteeRequiresQualifiedReferrer}
            onChange={(v) => set("inviteeRequiresQualifiedReferrer", v)}
          />
        </Model>

        <Model
          n={3}
          title="Milestones — reward the ladder"
          blurb="Refer 3 and get bronze, 10 and get silver. Each step pays once. Counts only ACTIVE invitees, so addresses that never verify cannot climb it."
        >
          <Switch
            label="Milestones are on"
            checked={cfg.milestonesEnabled}
            onChange={(v) => set("milestonesEnabled", v)}
          />
          <div className="space-y-2">
            {cfg.milestones.length === 0 && (
              <p className="text-xs text-slate-500">
                No steps yet — add one below.
              </p>
            )}
            {cfg.milestones.map((m, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="w-24">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Referrals
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={m.referrals || ""}
                    onChange={(e) =>
                      setMilestone(i, {
                        referrals: parseInt(e.target.value) || 0,
                      })
                    }
                    className={inp}
                  />
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Reward
                  </label>
                  <select
                    value={m.rewardType}
                    onChange={(e) =>
                      setMilestone(i, {
                        rewardType: e.target.value as "POINTS" | "SUBSCRIPTION",
                      })
                    }
                    className={inp}
                  >
                    <option value="POINTS">Points</option>
                    <option value="SUBSCRIPTION">Free subscription</option>
                  </select>
                </div>
                {m.rewardType === "POINTS" ? (
                  <div className="w-28">
                    <label className="mb-1 block text-[11px] text-slate-400">
                      Points
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={m.points || ""}
                      onChange={(e) =>
                        setMilestone(i, { points: parseInt(e.target.value) || 0 })
                      }
                      className={inp}
                    />
                  </div>
                ) : (
                  <>
                    <div className="w-36">
                      <label className="mb-1 block text-[11px] text-slate-400">
                        Plan
                      </label>
                      <select
                        value={m.packageId}
                        onChange={(e) =>
                          setMilestone(i, { packageId: e.target.value })
                        }
                        className={inp}
                      >
                        <option value="">Choose…</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="mb-1 block text-[11px] text-slate-400">
                        Months
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={m.months || 1}
                        onChange={(e) =>
                          setMilestone(i, {
                            months: parseInt(e.target.value) || 1,
                          })
                        }
                        className={inp}
                      />
                    </div>
                  </>
                )}
                <div className="min-w-32 flex-1">
                  <label className="mb-1 block text-[11px] text-slate-400">
                    Name — the user sees this
                  </label>
                  <input
                    value={m.label}
                    onChange={(e) => setMilestone(i, { label: e.target.value })}
                    placeholder="Bronze"
                    className={inp}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => dropMilestone(i)}
                  className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-red-400"
                  aria-label="Remove step"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addMilestone}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add a step
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Each step is paid once per member, remembered by the step itself
              rather than by its referral number. You can change the number, the
              label and the reward on a step people have already passed without
              paying any of them a second time. Deleting a step and adding a new
              one in its place <em>is</em> a new step, and will pay again.
            </p>
          </div>

          {/* What counts as "active" — the setting that decides whether this
              ladder is worth climbing honestly or worth farming. */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              What counts as an active referral
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Num
                label="Days they must be active"
                value={cfg.milestoneActivity.minActiveDays}
                onChange={(v) =>
                  set("milestoneActivity", {
                    ...cfg.milestoneActivity,
                    minActiveDays: v,
                  })
                }
                cls={inp}
              />
              <Num
                label="…within the last N days"
                value={cfg.milestoneActivity.windowDays}
                onChange={(v) =>
                  set("milestoneActivity", {
                    ...cfg.milestoneActivity,
                    windowDays: Math.max(1, v),
                  })
                }
                cls={inp}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              A day counts when the invitee claims a daily mission or gets a task
              approved — DISTINCT days, so twenty tasks in one sitting is one day.
              Set the first to 0 to count any account that is simply not banned,
              which is easy to farm and not recommended when the prize is a plan.
            </p>
          </div>
        </Model>

        <Model
          n={4}
          title="Purchase-based — pay when they spend"
          blurb="A subscription and a first purchase are different signals, so they price separately."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch
              label="On buying a package"
              checked={cfg.subscriptionEnabled}
              onChange={(v) => set("subscriptionEnabled", v)}
            />
            <Num
              label="Referrer gets"
              value={cfg.subscriptionPoints}
              onChange={(v) => set("subscriptionPoints", v)}
              cls={inp}
            />
            <Switch
              label="On their FIRST purchase of anything else"
              checked={cfg.purchaseEnabled}
              onChange={(v) => set("purchaseEnabled", v)}
            />
            <Num
              label="Referrer gets"
              value={cfg.purchasePoints}
              onChange={(v) => set("purchasePoints", v)}
              cls={inp}
            />
          </div>
        </Model>

        <Model
          n={0}
          title="A cut of deposits and withdrawals"
          blurb="A percentage of the money an invitee moves, paid to whoever brought them in. This is what makes a referral programme pay for itself — the referrer keeps earning as their invitee keeps using the platform, so bringing people in is worth doing properly rather than once. Paid from the platform's margin; it never comes out of the user's own deposit or payout."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch
              label="On every deposit"
              checked={cfg.depositEnabled}
              onChange={(v) => set("depositEnabled", v)}
            />
            <Num
              label="Referrer gets (% of the deposit)"
              value={cfg.depositPercent}
              onChange={(v) => set("depositPercent", v)}
              cls={inp}
            />
            <Switch
              label="On every withdrawal"
              checked={cfg.withdrawalEnabled}
              onChange={(v) => set("withdrawalEnabled", v)}
            />
            <Num
              label="Referrer gets (% of the withdrawal)"
              value={cfg.withdrawalPercent}
              onChange={(v) => set("withdrawalPercent", v)}
              cls={inp}
            />
          </div>

          {cfg.depositEnabled && cfg.withdrawalEnabled && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <strong>Both legs are on.</strong> Someone with two accounts can
              deposit $100, withdraw it, deposit it again, and be paid{" "}
              {(Number(cfg.depositPercent) || 0) +
                (Number(cfg.withdrawalPercent) || 0)}
              % of $100 on every lap. The money never actually leaves them — only
              the withdrawal fee does. The two guards below are what make that
              loop stop paying; do not turn them off while both legs are on.
            </p>
          )}

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Anti-farm guards
            </p>
            <Switch
              label="Only pay the withdrawal cut on money the invitee EARNED here"
              description="On: a payout is worth a bonus only up to what that member has actually earned on the platform. Money that was deposited and sent straight back out is worth nothing on the way out, so a deposit→withdraw loop pays this leg once and then never again. Off re-opens it."
              checked={cfg.withdrawalBonusEarnedOnly}
              onChange={(v) => set("withdrawalBonusEarnedOnly", v)}
            />
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Num
                label="Max points one invitee can earn their referrer"
                value={cfg.moneyBonusMaxPointsPerUser}
                onChange={(v) => set("moneyBonusMaxPointsPerUser", v)}
                cls={inp}
              />
              <Num
                label="…over this many days"
                value={cfg.moneyBonusWindowDays}
                onChange={(v) => set("moneyBonusWindowDays", v)}
                cls={inp}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              A ceiling on what ONE member&apos;s deposits and withdrawals can
              ever be worth to whoever invited them, which is what bounds the
              deposit half of the loop. Near the limit the referrer is paid the
              remaining headroom rather than nothing, so a genuinely heavy user
              is not cut off silently. 0 removes the ceiling entirely.
            </p>
          </div>
        </Model>

        <Model
          n={5}
          title="Multi-tier commission"
          blurb="A percentage of what your invitees — and their invitees — earn, down the chain. It is a table of levels rather than one amount, so it keeps its own page."
        >
          <Link
            href="/admin/referrals?tab=commission"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20"
          >
            Open the level table
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Model>

        <Model
          n={6}
          title="Month-end activity bonus"
          blurb="Pays when an invitee stayed active through the month — the thing that turns a sign-up into a member."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Switch
              label="On"
              checked={cfg.monthlyEnabled}
              onChange={(v) => set("monthlyEnabled", v)}
            />
            <Num
              label="Referrer gets"
              value={cfg.monthlyPoints}
              onChange={(v) => set("monthlyPoints", v)}
              cls={inp}
            />
            <Num
              label="Active days needed"
              value={cfg.monthlyMinMissionDays}
              onChange={(v) => set("monthlyMinMissionDays", v)}
              cls={inp}
            />
          </div>
        </Model>

        <Model
          n={0}
          title="Anti-farming"
          blurb="Applied to the REFERRER's bonuses. Without these, referral rewards are the cheapest thing on the platform to abuse."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Num
              label="Referrer's minimum plan level"
              value={cfg.minReferrerAccessLevel}
              onChange={(v) => set("minReferrerAccessLevel", v)}
              cls={inp}
            />
            <Switch
              label="Referrer must be active today"
              description="They have to have completed their own daily mission."
              checked={cfg.requireReferrerDailyMission}
              onChange={(v) => set("requireReferrerDailyMission", v)}
            />
          </div>
        </Model>
      </div>
    </div>
  );
}

function Model({
  n,
  title,
  blurb,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="mb-2 flex items-start gap-2">
        {n > 0 && (
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-indigo-500/40 bg-indigo-500/15 text-[10px] font-bold text-indigo-300">
            {n}
          </span>
        )}
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            {blurb}
          </p>
        </div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Switch({
  label,
  description,
  checked,
  onChange,
  tone,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: "amber";
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded",
          tone === "amber" ? "accent-amber-500" : "accent-indigo-500"
        )}
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  cls,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  cls: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-slate-400">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className={cls}
      />
    </div>
  );
}
