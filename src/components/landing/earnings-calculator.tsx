"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calculator,
  Sparkles,
  ArrowRight,
  Coins,
  Users,
  ListChecks,
  TrendingUp,
  Minus,
  Plus,
  Lock,
} from "lucide-react";
import Link from "next/link";
import type { CalculatorContent, CalculatorPlan } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";

const PLAN_GRADIENTS: Record<string, string> = {
  FREE: "from-slate-500 to-slate-600",
  STARTER: "from-blue-500 to-cyan-500",
  PRO: "from-purple-500 to-pink-500",
  ELITE: "from-amber-500 to-orange-500",
  VIP: "from-emerald-500 to-teal-500",
};

const FALLBACK_GRADIENT = "from-blue-500 to-purple-500";

const TASK_PRESETS = [10, 50, 100, 250, 500] as const;

function pickDefaultPlan(plans: CalculatorPlan[]): string {
  if (plans.length === 0) return "";
  const pro = plans.find((p) => p.name === "PRO");
  if (pro) return pro.name;
  return plans[0].name;
}

function formatCurrency(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Compact currency (e.g. 12.3K, 1.2M) — always short so it can't overflow a
 *  narrow box. Small values read naturally (e.g. 540, 2.5). */
function formatCompact(value: number): string {
  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

type Props = Partial<CalculatorContent>;

export function EarningsCalculator(props: Props) {
  const v: CalculatorContent = {
    ...DEFAULT_LANDING_CONTENT.calculator,
    ...props,
  };

  const [plan, setPlan] = useState<string>(() => pickDefaultPlan(v.plans));
  const [dailyTasks, setDailyTasks] = useState(50);
  const [l1, setL1] = useState(20);
  const [l2, setL2] = useState(40);
  const [l3, setL3] = useState(80);

  const activePlan = v.plans.find((p) => p.name === plan) ?? v.plans[0];
  const activeGradient =
    PLAN_GRADIENTS[activePlan?.name ?? ""] ?? FALLBACK_GRADIENT;

  const teamLevels = activePlan?.team_levels ?? 0;
  const supportsL1 = teamLevels >= 1;
  const supportsL2 = teamLevels >= 2;
  const supportsL3 = teamLevels >= 3;

  const dailyDirect =
    dailyTasks * (activePlan?.per_task ?? 0) * (activePlan?.multiplier ?? 1);
  const teamDailyBase = v.avg_team_tasks_per_day * v.avg_team_rate;
  const c1 = v.commission_l1 / 100;
  const c2 = v.commission_l2 / 100;
  const c3 = v.commission_l3 / 100;
  const effectiveL1 = supportsL1 ? l1 : 0;
  const effectiveL2 = supportsL2 ? l2 : 0;
  const effectiveL3 = supportsL3 ? l3 : 0;
  const dailyTeam =
    teamDailyBase * (effectiveL1 * c1 + effectiveL2 * c2 + effectiveL3 * c3);
  const dailyTotal = dailyDirect + dailyTeam;
  const monthly = dailyTotal * 30;
  const yearly = dailyTotal * 365;

  const animatedMonthly = useCountUp(monthly);

  const directShare =
    dailyTotal > 0 ? Math.round((dailyDirect / dailyTotal) * 100) : 100;
  const teamShare = 100 - directShare;

  const adjustTasks = (delta: number) => {
    setDailyTasks((prev) => Math.max(0, Math.min(500, prev + delta)));
  };

  return (
    <section
      id="calculator"
      className="relative py-16 sm:py-24 px-4 scroll-mt-20 overflow-hidden bg-(--mk-band)"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 text-xs font-semibold mb-4">
            <Calculator className="w-3.5 h-3.5" />
            {v.badge}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-(--mk-text) tracking-tight">
            {v.heading}
          </h2>
          <p className="text-(--mk-muted) mt-3 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            {v.subheading}
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-px rounded-[1.75rem] bg-linear-to-br from-indigo-500/20 via-violet-500/20 to-emerald-500/20" />

          <div className="relative rounded-3xl border border-(--mk-border) bg-(--mk-surface) overflow-hidden shadow-xl shadow-black/5">
            <div className="grid lg:grid-cols-[1.1fr_1fr] gap-0">
              {/* LEFT — Inputs */}
              <div className="p-5 sm:p-7 lg:p-8 border-b lg:border-b-0 lg:border-r border-(--mk-border) space-y-6 sm:space-y-7">
                {/* Plan picker */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-(--mk-subtle)">
                      Choose your plan
                    </label>
                    <span className="text-[11px] text-(--mk-subtle)">
                      {v.plans.length} plans
                    </span>
                  </div>

                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:[grid-template-columns:repeat(var(--ec-cols),minmax(0,1fr))]"
                    style={{
                      ["--ec-cols" as string]: Math.max(v.plans.length, 1),
                    }}
                  >
                    {v.plans.map((p) => {
                      const gradient =
                        PLAN_GRADIENTS[p.name] ?? FALLBACK_GRADIENT;
                      const active = plan === p.name;
                      return (
                        <button
                          key={p.name}
                          onClick={() => setPlan(p.name)}
                          aria-pressed={active}
                          className={`group relative rounded-xl p-3 text-left transition-all duration-200 border ${
                            active
                              ? `bg-linear-to-br ${gradient} border-transparent shadow-md scale-[1.02]`
                              : "bg-(--mk-surface) border-(--mk-border) hover:bg-(--mk-surface-2) hover:border-(--mk-border-strong)"
                          }`}
                        >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[11px] sm:text-xs font-extrabold tracking-wide ${
                                  active ? "text-white" : "text-(--mk-text)"
                                }`}
                              >
                                {p.name}
                              </span>
                              {active && (
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              )}
                            </div>
                            <div
                              className={`mt-1.5 text-[11px] tabular-nums font-semibold ${
                                active ? "text-white/90" : "text-(--mk-subtle)"
                              }`}
                            >
                              ${p.per_task}/task
                            </div>
                            <div
                              className={`mt-0.5 text-[10px] ${
                                active ? "text-white/70" : "text-(--mk-subtle)"
                              }`}
                            >
                              {p.team_levels === 0
                                ? "Solo"
                                : `${p.team_levels} team lvl${p.team_levels > 1 ? "s" : ""}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                  <p className="text-[11px] text-(--mk-subtle) mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-indigo-500" />
                      Rate{" "}
                      <span className="text-(--mk-text) tabular-nums">
                        ${activePlan?.per_task ?? 0}
                      </span>
                      /task
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-violet-500" />
                      Multiplier{" "}
                      <span className="text-(--mk-text) tabular-nums">
                        {activePlan?.multiplier ?? 1}×
                      </span>
                    </span>
                  </p>
                </div>

                {/* Daily tasks */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-(--mk-subtle)">
                      Daily tasks
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => adjustTasks(-5)}
                        className="w-7 h-7 rounded-lg bg-(--mk-surface) hover:bg-(--mk-surface-2) border border-(--mk-border) flex items-center justify-center text-(--mk-muted) transition-colors disabled:opacity-30"
                        disabled={dailyTasks <= 0}
                        aria-label="Decrease daily tasks"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="min-w-[3.5rem] text-center text-base sm:text-lg font-extrabold text-indigo-600 tabular-nums">
                        {dailyTasks}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustTasks(5)}
                        className="w-7 h-7 rounded-lg bg-(--mk-surface) hover:bg-(--mk-surface-2) border border-(--mk-border) flex items-center justify-center text-(--mk-muted) transition-colors disabled:opacity-30"
                        disabled={dailyTasks >= 500}
                        aria-label="Increase daily tasks"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={5}
                    value={dailyTasks}
                    onChange={(e) => setDailyTasks(Number(e.target.value))}
                    className="ec-range w-full"
                    style={{
                      ["--ec-progress" as string]: `${(dailyTasks / 500) * 100}%`,
                    }}
                    aria-label="Daily tasks"
                  />

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {TASK_PRESETS.map((preset) => {
                      const active = dailyTasks === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDailyTasks(preset)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
                            active
                              ? "bg-indigo-500/10 text-indigo-600 border border-indigo-500/30"
                              : "bg-(--mk-surface) text-(--mk-subtle) border border-(--mk-border) hover:bg-(--mk-surface-2) hover:text-(--mk-text)"
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Team size */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-(--mk-subtle)">
                      Team size
                    </label>
                    {teamLevels > 0 && (
                      <span className="text-[11px] text-(--mk-subtle)">
                        {teamLevels} level{teamLevels > 1 ? "s" : ""} unlocked
                      </span>
                    )}
                  </div>

                  {teamLevels === 0 ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 text-xs text-(--mk-muted) leading-relaxed">
                        <span className="font-bold text-amber-600">
                          {activePlan?.name ?? "This"} plan
                        </span>{" "}
                        is solo-only. Upgrade to{" "}
                        <span className="font-semibold text-amber-600">
                          STARTER
                        </span>{" "}
                        or higher to unlock referral commissions and team
                        earnings.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {(
                        [
                          {
                            key: "l1",
                            enabled: supportsL1,
                            label: "Level 1",
                            commission: v.commission_l1,
                            value: l1,
                            set: setL1,
                            color: "emerald",
                            dot: "bg-emerald-500",
                            badge:
                              "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                            valueText: "text-emerald-600",
                            rangeClass: "ec-range-emerald",
                          },
                          {
                            key: "l2",
                            enabled: supportsL2,
                            label: "Level 2",
                            commission: v.commission_l2,
                            value: l2,
                            set: setL2,
                            color: "purple",
                            dot: "bg-violet-500",
                            badge:
                              "bg-violet-500/10 text-violet-600 border-violet-500/30",
                            valueText: "text-violet-600",
                            rangeClass: "ec-range-purple",
                          },
                          {
                            key: "l3",
                            enabled: supportsL3,
                            label: "Level 3",
                            commission: v.commission_l3,
                            value: l3,
                            set: setL3,
                            color: "amber",
                            dot: "bg-amber-500",
                            badge:
                              "bg-amber-500/10 text-amber-600 border-amber-500/30",
                            valueText: "text-amber-600",
                            rangeClass: "ec-range-amber",
                          },
                        ] as const
                      )
                        .filter((row) => row.enabled)
                        .map((row) => (
                          <div
                            key={row.key}
                            className="rounded-xl bg-(--mk-surface-2) border border-(--mk-border) p-3"
                          >
                            <div className="flex items-center justify-between text-xs mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${row.dot}`}
                                />
                                <span className="font-semibold text-(--mk-text)">
                                  {row.label}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${row.badge}`}
                                >
                                  {row.commission}%
                                </span>
                              </div>
                              <span
                                className={`tabular-nums font-extrabold ${row.valueText}`}
                              >
                                {row.value}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={500}
                              step={5}
                              value={row.value}
                              onChange={(e) =>
                                row.set(Number(e.target.value))
                              }
                              className={`ec-range ${row.rangeClass} w-full`}
                              style={{
                                ["--ec-progress" as string]: `${(row.value / 500) * 100}%`,
                              }}
                              aria-label={`${row.label} team size`}
                            />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Results */}
              <div className="relative p-5 sm:p-7 lg:p-8 bg-linear-to-br from-indigo-500/[0.07] via-transparent to-transparent">
                <div
                  aria-hidden
                  className={`absolute -top-20 -right-20 w-64 h-64 rounded-full bg-linear-to-br ${activeGradient} opacity-10 blur-3xl pointer-events-none transition-all duration-500`}
                />

                <div className="relative">
                  <div className="text-center">
                    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-(--mk-subtle)">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Monthly Potential
                    </p>
                    <p className="mt-2 text-[clamp(2rem,11vw,3.75rem)] font-extrabold bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent tabular-nums leading-none">
                      ${formatCurrency(animatedMonthly)}
                    </p>
                    <p className="text-xs sm:text-sm text-(--mk-subtle) mt-2 tabular-nums">
                      ≈{" "}
                      <span className="text-(--mk-text) font-semibold">
                        ${formatCompact(dailyTotal)}
                      </span>{" "}
                      per day
                    </p>
                  </div>

                  {/* Breakdown bar */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="inline-flex items-center gap-1.5 text-(--mk-subtle)">
                        <span className="w-2 h-2 rounded-sm bg-indigo-500" />
                        Tasks{" "}
                        <span className="text-(--mk-text) font-bold tabular-nums">
                          {directShare}%
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-(--mk-subtle)">
                        <span className="text-(--mk-text) font-bold tabular-nums">
                          {teamShare}%
                        </span>{" "}
                        Team
                        <span className="w-2 h-2 rounded-sm bg-violet-500" />
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden bg-(--mk-surface-2) border border-(--mk-border) flex">
                      <div
                        className="h-full bg-linear-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
                        style={{ width: `${directShare}%` }}
                      />
                      <div
                        className="h-full bg-linear-to-r from-violet-500 to-fuchsia-400 transition-all duration-500"
                        style={{ width: `${teamShare}%` }}
                      />
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
                    <div className="min-w-0 rounded-xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-2.5 sm:p-3 text-center">
                      <ListChecks className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
                      <p className="text-[9px] sm:text-[10px] uppercase font-bold text-(--mk-subtle) tracking-wider">
                        From Tasks
                      </p>
                      <p className="text-sm sm:text-base font-bold text-(--mk-text) tabular-nums mt-0.5">
                        ${formatCompact(dailyDirect * 30)}
                      </p>
                      <p className="text-[9px] text-(--mk-subtle) mt-0.5">/mo</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-2.5 sm:p-3 text-center">
                      <Users className="w-4 h-4 text-violet-600 mx-auto mb-1" />
                      <p className="text-[9px] sm:text-[10px] uppercase font-bold text-(--mk-subtle) tracking-wider">
                        From Team
                      </p>
                      <p className="text-sm sm:text-base font-bold text-(--mk-text) tabular-nums mt-0.5">
                        ${formatCompact(dailyTeam * 30)}
                      </p>
                      <p className="text-[9px] text-(--mk-subtle) mt-0.5">/mo</p>
                    </div>
                    <div className="min-w-0 rounded-xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-2.5 sm:p-3 text-center">
                      <Coins className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                      <p className="text-[9px] sm:text-[10px] uppercase font-bold text-(--mk-subtle) tracking-wider">
                        Daily
                      </p>
                      <p className="text-sm sm:text-base font-bold text-(--mk-text) tabular-nums mt-0.5">
                        ${formatCompact(dailyTotal)}
                      </p>
                      <p className="text-[9px] text-(--mk-subtle) mt-0.5">/day</p>
                    </div>
                  </div>

                  {/* Yearly callout */}
                  <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 sm:p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-600">
                        Yearly Projection
                      </p>
                      <p className="text-lg sm:text-xl font-extrabold text-(--mk-text) tabular-nums">
                        ${formatCompact(yearly)}
                      </p>
                    </div>
                  </div>

                  {/* CTA */}
                  <Link
                    href="/register"
                    className="group mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 sm:py-4 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm sm:text-base font-bold transition-all shadow-lg shadow-indigo-600/25 active:scale-[0.99]"
                  >
                    Start Earning Now
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <p className="text-[10px] sm:text-[11px] text-(--mk-subtle) text-center mt-2.5">
                    Estimates only · Actual earnings vary by activity
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom range slider styling */}
      <style jsx>{`
        .ec-range {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            rgb(79 70 229) 0%,
            rgb(124 58 237) var(--ec-progress, 0%),
            var(--mk-border) var(--ec-progress, 0%),
            var(--mk-border) 100%
          );
          outline: none;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .ec-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: white;
          border: 3px solid rgb(79 70 229);
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35);
          cursor: grab;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .ec-range::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
        .ec-range::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.5);
        }
        .ec-range::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          background: white;
          border: 3px solid rgb(79 70 229);
          box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35);
          cursor: grab;
          transition: transform 0.15s ease;
        }
        .ec-range::-moz-range-thumb:hover {
          transform: scale(1.15);
        }
        .ec-range-emerald {
          background: linear-gradient(
            to right,
            rgb(16 185 129) 0%,
            rgb(20 184 166) var(--ec-progress, 0%),
            var(--mk-border) var(--ec-progress, 0%),
            var(--mk-border) 100%
          );
        }
        .ec-range-emerald::-webkit-slider-thumb {
          border-color: rgb(16 185 129);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
        }
        .ec-range-emerald::-moz-range-thumb {
          border-color: rgb(16 185 129);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
        }
        .ec-range-purple {
          background: linear-gradient(
            to right,
            rgb(139 92 246) 0%,
            rgb(217 70 239) var(--ec-progress, 0%),
            var(--mk-border) var(--ec-progress, 0%),
            var(--mk-border) 100%
          );
        }
        .ec-range-purple::-webkit-slider-thumb {
          border-color: rgb(139 92 246);
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.35);
        }
        .ec-range-purple::-moz-range-thumb {
          border-color: rgb(139 92 246);
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.35);
        }
        .ec-range-amber {
          background: linear-gradient(
            to right,
            rgb(245 158 11) 0%,
            rgb(249 115 22) var(--ec-progress, 0%),
            var(--mk-border) var(--ec-progress, 0%),
            var(--mk-border) 100%
          );
        }
        .ec-range-amber::-webkit-slider-thumb {
          border-color: rgb(245 158 11);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
        }
        .ec-range-amber::-moz-range-thumb {
          border-color: rgb(245 158 11);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
        }
        .scrollbar-thin::-webkit-scrollbar {
          height: 4px;
        }
      `}</style>
    </section>
  );
}
