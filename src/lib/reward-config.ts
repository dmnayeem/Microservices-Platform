/**
 * Admin-editable reward figures that used to be hardcoded in routes:
 * the 7-day daily reward ladder (+ day-7 mystery box), the daily solo reward,
 * and the per-milestone rewards.
 *
 * Prisma-free on purpose: the admin editors import the defaults and the
 * validators as runtime values, and the routes import the same validators, so
 * the form and the server can never disagree about what is allowed.
 *
 * DEFAULTS ARE EXACTLY THE OLD HARDCODED VALUES. A platform with no row saved
 * behaves precisely as it did before these settings existed.
 */

// ── Keys ────────────────────────────────────────────────────────────────────
export const DAILY_REWARD_KEY = "daily_reward.config";
export const SOLO_REWARD_KEY = "solo_reward.config";
export const MILESTONE_REWARDS_KEY = "milestones.rewards";
export const MILESTONE_REFERRAL_DEFER_KEY = "milestones.referral_defer_to_ladder";

/** Largest single reward any of these editors will accept (points or XP). */
export const REWARD_MAX_POINTS = 100_000;
export const REWARD_MAX_XP = 10_000;

// ── Daily reward ────────────────────────────────────────────────────────────
export interface DailyRewardDay {
  points: number;
  xp: number;
}
export interface MysteryBoxOutcome {
  type: "points" | "xp";
  min: number;
  max: number;
}
export interface DailyRewardConfig {
  /** Exactly 7 entries: streak day 1..7, then the ladder repeats. */
  days: DailyRewardDay[];
  /** Day 7 also opens a mystery box. */
  mysteryBoxEnabled: boolean;
  /** One outcome is picked at random, then a value in [min, max]. */
  mysteryBox: MysteryBoxOutcome[];
}

export const DAILY_REWARD_DEFAULTS: DailyRewardConfig = {
  days: [
    { points: 50, xp: 10 },
    { points: 75, xp: 15 },
    { points: 100, xp: 20 },
    { points: 125, xp: 25 },
    { points: 150, xp: 30 },
    { points: 200, xp: 40 },
    { points: 300, xp: 60 },
  ],
  mysteryBoxEnabled: true,
  mysteryBox: [
    { type: "points", min: 100, max: 500 },
    { type: "xp", min: 50, max: 200 },
    { type: "points", min: 200, max: 1000 }, // rare jackpot
  ],
};

// ── Solo reward ─────────────────────────────────────────────────────────────
export interface SoloRewardConfig {
  points: number;
  xp: number;
  /** Approved task submissions needed today. */
  tasksToday: number;
  /** USD earned today (EARNING/BONUS/REFERRAL rows). */
  earningsToday: number;
}

export const SOLO_REWARD_DEFAULTS: SoloRewardConfig = {
  points: 500,
  xp: 100,
  tasksToday: 5,
  earningsToday: 1,
};

// ── Milestones ──────────────────────────────────────────────────────────────
export interface MilestoneOverride {
  points?: number;
  enabled?: boolean;
}
/** id → override. A missing id means "use the built-in value, enabled". */
export type MilestoneRewardOverrides = Record<string, MilestoneOverride>;

// ── Validation ──────────────────────────────────────────────────────────────
/** Whole number in [min, max], or an error message naming the field. */
function intIn(v: unknown, min: number, max: number, label: string): number | string {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return `${label} must be a number.`;
  if (!Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max)
    return `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`;
  return n;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateDailyRewardConfig(raw: unknown): Validated<DailyRewardConfig> {
  const r = (raw ?? {}) as Partial<DailyRewardConfig>;
  if (!Array.isArray(r.days) || r.days.length !== 7)
    return { ok: false, error: "The ladder must have exactly 7 days." };
  const days: DailyRewardDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = (r.days[i] ?? {}) as Partial<DailyRewardDay>;
    const points = intIn(d.points, 0, REWARD_MAX_POINTS, `Day ${i + 1} points`);
    if (typeof points === "string") return { ok: false, error: points };
    const xp = intIn(d.xp, 0, REWARD_MAX_XP, `Day ${i + 1} XP`);
    if (typeof xp === "string") return { ok: false, error: xp };
    days.push({ points, xp });
  }
  if (!Array.isArray(r.mysteryBox) || r.mysteryBox.length < 1 || r.mysteryBox.length > 10)
    return { ok: false, error: "The mystery box needs 1 to 10 outcomes." };
  const mysteryBox: MysteryBoxOutcome[] = [];
  for (let i = 0; i < r.mysteryBox.length; i++) {
    const o = (r.mysteryBox[i] ?? {}) as Partial<MysteryBoxOutcome>;
    if (o.type !== "points" && o.type !== "xp")
      return { ok: false, error: `Mystery box outcome ${i + 1} must be points or XP.` };
    const cap = o.type === "points" ? REWARD_MAX_POINTS : REWARD_MAX_XP;
    const min = intIn(o.min, 0, cap, `Mystery box outcome ${i + 1} minimum`);
    if (typeof min === "string") return { ok: false, error: min };
    const max = intIn(o.max, 0, cap, `Mystery box outcome ${i + 1} maximum`);
    if (typeof max === "string") return { ok: false, error: max };
    if (max < min)
      return { ok: false, error: `Mystery box outcome ${i + 1}: maximum is below minimum.` };
    mysteryBox.push({ type: o.type, min, max });
  }
  return {
    ok: true,
    value: { days, mysteryBoxEnabled: r.mysteryBoxEnabled !== false, mysteryBox },
  };
}

export function validateSoloRewardConfig(raw: unknown): Validated<SoloRewardConfig> {
  const r = (raw ?? {}) as Partial<SoloRewardConfig>;
  const points = intIn(r.points, 0, REWARD_MAX_POINTS, "Points");
  if (typeof points === "string") return { ok: false, error: points };
  const xp = intIn(r.xp, 0, REWARD_MAX_XP, "XP");
  if (typeof xp === "string") return { ok: false, error: xp };
  const tasksToday = intIn(r.tasksToday, 0, 1000, "Tasks needed today");
  if (typeof tasksToday === "string") return { ok: false, error: tasksToday };
  const e = typeof r.earningsToday === "string" ? Number(r.earningsToday) : r.earningsToday;
  if (typeof e !== "number" || !Number.isFinite(e) || e < 0 || e > 10_000)
    return { ok: false, error: "Earnings needed today must be between $0 and $10,000." };
  return {
    ok: true,
    value: { points, xp, tasksToday, earningsToday: Math.round(e * 100) / 100 },
  };
}

export function validateMilestoneOverrides(
  raw: unknown,
  knownIds: readonly string[]
): Validated<MilestoneRewardOverrides> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "Milestone rewards must be an object." };
  const out: MilestoneRewardOverrides = {};
  for (const [id, o] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownIds.includes(id)) return { ok: false, error: `Unknown milestone: ${id}` };
    const ov = (o ?? {}) as MilestoneOverride;
    const entry: MilestoneOverride = {};
    if (ov.points !== undefined) {
      const p = intIn(ov.points, 0, REWARD_MAX_POINTS, `${id} points`);
      if (typeof p === "string") return { ok: false, error: p };
      entry.points = p;
    }
    if (ov.enabled !== undefined) entry.enabled = ov.enabled !== false;
    out[id] = entry;
  }
  return { ok: true, value: out };
}

// ── Read-side normalisers (never throw; fall back to defaults) ─────────────
export function normaliseDailyRewardConfig(raw: unknown): DailyRewardConfig {
  if (!raw || typeof raw !== "object") return DAILY_REWARD_DEFAULTS;
  const v = validateDailyRewardConfig(raw);
  return v.ok ? v.value : DAILY_REWARD_DEFAULTS;
}

export function normaliseSoloRewardConfig(raw: unknown): SoloRewardConfig {
  if (!raw || typeof raw !== "object") return SOLO_REWARD_DEFAULTS;
  const v = validateSoloRewardConfig({ ...SOLO_REWARD_DEFAULTS, ...(raw as object) });
  return v.ok ? v.value : SOLO_REWARD_DEFAULTS;
}
