import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getSetting,
  invalidateSettingsCache,
  primeSetting,
} from "@/lib/system-settings";

/**
 * Payroll configuration — salaries and commission rates for STAFF accounts.
 *
 * Stored in `SystemSetting` rather than in dedicated tables because this round
 * could not touch `prisma/schema.prisma`. Configuration is the part of payroll
 * that genuinely belongs in settings anyway: it is a handful of rows, it is
 * edited by one person, and it has no history requirement. The *payments* do
 * have one, and those are written to the `Transaction` ledger (see `run.ts`)
 * rather than to a settings blob, so every payment is a real row with a real
 * reference, real idempotency and a real audit trail.
 *
 * Every rate ships at **zero**. Nothing here invents a salary or a commission
 * percentage: an unset rate pays nothing and the console says "not set" instead
 * of quietly paying a default that nobody chose.
 */

export const KEY_ENABLED = "payroll.enabled";
export const KEY_SALARIES = "payroll.salaries";
export const KEY_COMMISSION = "payroll.commission";
export const KEY_OVERRIDES = "payroll.commission_overrides";

/** One staff member's salary line. */
export interface SalaryLine {
  /** Gross pay for one full period (a UTC calendar month). USD. */
  monthlyUsd: number;
  /** Free-text job title, shown on the payroll sheet. */
  title: string;
  /**
   * First period this salary applies to, `YYYY-MM`. Empty means "always" —
   * which is what a new hire's first run wants to avoid, because without it a
   * salary set today would show as owed for every month in history.
   */
  startPeriod: string;
  /** Last period, `YYYY-MM`. Empty means open-ended. */
  endPeriod: string;
}

/** A commission rate. Both halves apply; either may be zero. */
export interface CommissionRate {
  /** Flat USD per item handled. */
  perUnitUsd: number;
  /** Percent of the money value the item carried, where it carries one. */
  percentOfValue: number;
}

export interface PayrollConfig {
  enabled: boolean;
  /** staff userId → salary line. */
  salaries: Record<string, SalaryLine>;
  /** basis key → the rate everyone gets. */
  commission: Record<string, CommissionRate>;
  /** staff userId → basis key → rate, overriding the platform default. */
  overrides: Record<string, Record<string, CommissionRate>>;
}

export const ZERO_RATE: CommissionRate = { perUnitUsd: 0, percentOfValue: 0 };

function num(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** `YYYY-MM`, or "" — anything else is discarded rather than half-trusted. */
function period(v: unknown): string {
  const s = str(v, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : "";
}

function rate(v: unknown): CommissionRate {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    // Capped: a mistyped rate is the one payroll bug that cannot be undone
    // once the cash has left, so the bounds are deliberately tight.
    perUnitUsd: num(o.perUnitUsd, 0, 10_000),
    percentOfValue: num(o.percentOfValue, 0, 100),
  };
}

function salary(v: unknown): SalaryLine {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    monthlyUsd: num(o.monthlyUsd, 0, 1_000_000),
    title: str(o.title, 80),
    startPeriod: period(o.startPeriod),
    endPeriod: period(o.endPeriod),
  };
}

function recordOf<T>(v: unknown, map: (x: unknown) => T): Record<string, T> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0 && k.length <= 64) out[k] = map(val);
  }
  return out;
}

export async function getPayrollConfig(): Promise<PayrollConfig> {
  const [enabled, salaries, commission, overrides] = await Promise.all([
    getSetting<boolean>(KEY_ENABLED, false),
    getSetting<unknown>(KEY_SALARIES, null),
    getSetting<unknown>(KEY_COMMISSION, null),
    getSetting<unknown>(KEY_OVERRIDES, null),
  ]);

  return {
    enabled: enabled === true,
    salaries: recordOf(salaries, salary),
    commission: recordOf(commission, rate),
    overrides: recordOf(overrides, (v) => recordOf(v, rate)),
  };
}

/** The rate that applies to one person on one basis. */
export function rateFor(
  cfg: PayrollConfig,
  userId: string,
  basisKey: string
): CommissionRate {
  return (
    cfg.overrides[userId]?.[basisKey] ?? cfg.commission[basisKey] ?? ZERO_RATE
  );
}

/** Is this salary line in force for the given `YYYY-MM`? */
export function salaryAppliesIn(line: SalaryLine, forPeriod: string): boolean {
  if (line.startPeriod && forPeriod < line.startPeriod) return false;
  if (line.endPeriod && forPeriod > line.endPeriod) return false;
  return true;
}

type SettingPatch = Partial<{
  enabled: boolean;
  salaries: Record<string, SalaryLine>;
  commission: Record<string, CommissionRate>;
  overrides: Record<string, Record<string, CommissionRate>>;
}>;

/**
 * Persist a config change. Validated on the way in by the same functions that
 * read it, so a hand-edited settings row cannot widen a rate past its cap.
 */
export async function savePayrollConfig(patch: SettingPatch): Promise<void> {
  const writes: Array<{ key: string; value: unknown; description: string }> = [];
  if (patch.enabled !== undefined) {
    writes.push({
      key: KEY_ENABLED,
      value: patch.enabled === true,
      description: "Payroll module on/off",
    });
  }
  if (patch.salaries) {
    writes.push({
      key: KEY_SALARIES,
      value: recordOf(patch.salaries, salary),
      description: "Staff salary lines (USD per month)",
    });
  }
  if (patch.commission) {
    writes.push({
      key: KEY_COMMISSION,
      value: recordOf(patch.commission, rate),
      description: "Default staff commission rates by basis",
    });
  }
  if (patch.overrides) {
    writes.push({
      key: KEY_OVERRIDES,
      value: recordOf(patch.overrides, (v) => recordOf(v, rate)),
      description: "Per-staff commission rate overrides",
    });
  }

  for (const w of writes) {
    await prisma.systemSetting.upsert({
      where: { key: w.key },
      create: {
        key: w.key,
        value: w.value as object,
        category: "payroll",
        description: w.description,
      },
      update: { value: w.value as object, category: "payroll" },
    });
  }
  // Order matters: clear first, then prime. `getSetting` reads through an
  // Accelerate cacheStrategy whose edge cache is not ours to clear, so a
  // freshly saved rate still reads as its old value without priming — and
  // priming before the clear would simply be wiped by it.
  invalidateSettingsCache();
  for (const w of writes) primeSetting(w.key, w.value);
}
