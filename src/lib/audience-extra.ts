/**
 * The audience rules popups had and banners didn't (now shared): plan (any /
 * free / paid / specific plans), level range and account age. Client-safe.
 * Empty rule = everyone; a signed-out viewer matches only rules that are empty.
 */

export const PLAN_AUDIENCES = ["ANY", "FREE", "PAID"] as const;
export type PlanAudience = (typeof PLAN_AUDIENCES)[number];

export interface ExtraAudienceRule {
  planAudience?: string | null;
  packageIds?: string[] | null;
  minLevel?: number | null;
  maxLevel?: number | null;
  minAccountDays?: number | null;
  maxAccountDays?: number | null;
}

export interface ExtraAudienceViewer {
  plan: { id: string; paid: boolean } | null;
  level: number | null;
  /** Account creation time (ms). */
  joinedAt: number | null;
}

const DAY_MS = 86_400_000;

export function sanitizePlanAudience(v: unknown): PlanAudience {
  return (PLAN_AUDIENCES as readonly string[]).includes(String(v)) ? (v as PlanAudience) : "ANY";
}

export function needsPlan(r: ExtraAudienceRule): boolean {
  return sanitizePlanAudience(r.planAudience) !== "ANY" || (r.packageIds?.length ?? 0) > 0;
}

export function hasExtraAudience(r: ExtraAudienceRule): boolean {
  return needsPlan(r) || r.minLevel != null || r.maxLevel != null || r.minAccountDays != null || r.maxAccountDays != null;
}

export function matchesExtraAudience(r: ExtraAudienceRule, v: ExtraAudienceViewer, now = Date.now()): boolean {
  if (needsPlan(r)) {
    const pa = sanitizePlanAudience(r.planAudience);
    if (!v.plan) return false;
    if (pa === "FREE" && v.plan.paid) return false;
    if (pa === "PAID" && !v.plan.paid) return false;
    if (r.packageIds?.length && !r.packageIds.includes(v.plan.id)) return false;
  }
  if (r.minLevel != null || r.maxLevel != null) {
    if (v.level == null) return false;
    if (r.minLevel != null && v.level < r.minLevel) return false;
    if (r.maxLevel != null && v.level > r.maxLevel) return false;
  }
  if (r.minAccountDays != null || r.maxAccountDays != null) {
    if (v.joinedAt == null) return false;
    const days = Math.floor((now - v.joinedAt) / DAY_MS);
    if (r.minAccountDays != null && days < r.minAccountDays) return false;
    if (r.maxAccountDays != null && days > r.maxAccountDays) return false;
  }
  return true;
}

const int = (v: unknown, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null;
};

/** From a request body (admin forms). */
export function sanitizeExtraAudience(body: Record<string, unknown>): {
  planAudience: PlanAudience;
  packageIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  minAccountDays: number | null;
  maxAccountDays: number | null;
} {
  return {
    planAudience: sanitizePlanAudience(body.planAudience),
    packageIds: Array.isArray(body.packageIds)
      ? [...new Set(body.packageIds.filter((x): x is string => typeof x === "string" && x.length < 64))].slice(0, 50)
      : [],
    minLevel: int(body.minLevel, 999),
    maxLevel: int(body.maxLevel, 999),
    minAccountDays: int(body.minAccountDays, 36500),
    maxAccountDays: int(body.maxAccountDays, 36500),
  };
}

export const EXTRA_AUDIENCE_KEYS = ["planAudience", "packageIds", "minLevel", "maxLevel", "minAccountDays", "maxAccountDays"];
