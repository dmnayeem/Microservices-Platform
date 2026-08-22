import type { Prisma } from "@/generated/prisma/client";

/**
 * Task audience targeting — the task-side mirror of the Ads audience system
 * (src/lib/ad-targeting.ts). A task carries per-dimension arrays (countries,
 * genders, regions, divisions, districts, subDistricts) plus an age window
 * (minAge/maxAge); an empty array / null bound = no constraint on that
 * dimension. Matching is STRICT: if a task targets a dimension and the viewer's
 * profile has no value for it (or a value that isn't in the target set), the
 * task is hidden and can't be started.
 *
 * `taskAudienceWhere` produces Prisma `Task` AND-clauses for the serve queries
 * (keeps pagination counts correct — discrete columns, not a JSON blob);
 * `matchesTaskAudience` is the imperative equivalent for the start-gate + detail
 * guard.
 */

/** The viewer attributes a task targets on. */
export interface TaskAudienceUser {
  country?: string | null;
  region?: string | null;
  division?: string | null;
  district?: string | null;
  subDistrict?: string | null;
  postalCode?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
}

/** The targeting columns read off a Task row. */
export interface TaskAudience {
  countries: string[];
  genders: string[];
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
  minAge: number | null;
  maxAge: number | null;
}

/** Whole years old from a date of birth, or null when unknown/invalid. */
export function ageFromDob(
  dob: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// The array dimensions, paired with the viewer field they match against.
const ARRAY_DIMENSIONS: {
  field:
    | "countries"
    | "genders"
    | "regions"
    | "divisions"
    | "districts"
    | "subDistricts"
    | "postalCodes";
  userKey: keyof TaskAudienceUser;
}[] = [
  { field: "countries", userKey: "country" },
  { field: "genders", userKey: "gender" },
  { field: "regions", userKey: "region" },
  { field: "divisions", userKey: "division" },
  { field: "districts", userKey: "district" },
  { field: "subDistricts", userKey: "subDistrict" },
  { field: "postalCodes", userKey: "postalCode" },
];

/**
 * STRICT Prisma AND-clauses for "which rows may this viewer see". Spread the
 * result into an existing `AND` array on the where filter.
 *
 * Generic in the where-input type because `TaskBoard`, `Mission` and
 * `DailyMissionTemplate` carry the same nine targeting columns as `Task`, and
 * the clause shapes are structurally identical — the alternative was three
 * copies of this function that could drift apart. Defaults to
 * `Prisma.TaskWhereInput` so every existing call site is unchanged.
 */
export function taskAudienceWhere<T = Prisma.TaskWhereInput>(
  user: TaskAudienceUser
): T[] {
  // Built as plain objects, then cast once on return. The column names are
  // identical across every model that has targeting, so the shapes are valid
  // for all of them; TypeScript just can't prove that for an open `T`.
  const clauses: Record<string, unknown>[] = [];

  for (const { field, userKey } of ARRAY_DIMENSIONS) {
    const value = (user[userKey] as string | null | undefined) ?? "";
    if (value) {
      // Untargeted (empty) OR the viewer's value is in the target set.
      clauses.push({
        OR: [{ [field]: { isEmpty: true } }, { [field]: { has: value } }],
      });
    } else {
      // Viewer has no value for this dimension → only untargeted rows.
      clauses.push({ [field]: { isEmpty: true } });
    }
  }

  const age = ageFromDob(user.dateOfBirth);
  if (age !== null) {
    clauses.push({ OR: [{ minAge: null }, { minAge: { lte: age } }] });
    clauses.push({ OR: [{ maxAge: null }, { maxAge: { gte: age } }] });
  } else {
    // Age unknown → exclude any row that sets an age bound.
    clauses.push({ minAge: null });
    clauses.push({ maxAge: null });
  }

  return clauses as T[];
}

/** Imperative STRICT check — true when the viewer may see/start the task. */
export function matchesTaskAudience(
  task: TaskAudience,
  user: TaskAudienceUser
): boolean {
  for (const { field, userKey } of ARRAY_DIMENSIONS) {
    const targets = task[field];
    if (targets && targets.length > 0) {
      const value = (user[userKey] as string | null | undefined) ?? "";
      if (!value || !targets.includes(value)) return false;
    }
  }

  if (task.minAge != null || task.maxAge != null) {
    const age = ageFromDob(user.dateOfBirth);
    if (age === null) return false;
    if (task.minAge != null && age < task.minAge) return false;
    if (task.maxAge != null && age > task.maxAge) return false;
  }

  return true;
}

// ── Request-body sanitizing (shared by admin + self-serve create/edit) ───────

function cleanStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return [...new Set(out)];
}

function cleanAge(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 120) return null;
  return n;
}

export interface TaskAudienceInput {
  countries: string[];
  genders: string[];
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
  minAge: number | null;
  maxAge: number | null;
}

/** Normalize a raw request body into the persisted targeting fields. */
export function sanitizeTaskAudience(
  body: Record<string, unknown>
): TaskAudienceInput {
  const genders = cleanStrArray(body.genders)
    .map((g) => g.toUpperCase())
    .filter((g) => g === "MALE" || g === "FEMALE" || g === "OTHER");
  let minAge = cleanAge(body.minAge);
  let maxAge = cleanAge(body.maxAge);
  if (minAge != null && maxAge != null && minAge > maxAge) {
    [minAge, maxAge] = [maxAge, minAge];
  }
  return {
    countries: cleanStrArray(body.countries),
    genders,
    regions: cleanStrArray(body.regions),
    divisions: cleanStrArray(body.divisions),
    districts: cleanStrArray(body.districts),
    subDistricts: cleanStrArray(body.subDistricts),
    postalCodes: cleanStrArray(body.postalCodes),
    minAge,
    maxAge,
  };
}

/** The nine persisted targeting keys, in one place. */
export const TASK_AUDIENCE_KEYS = [
  "countries",
  "genders",
  "regions",
  "divisions",
  "districts",
  "subDistricts",
  "postalCodes",
  "minAge",
  "maxAge",
] as const;

/**
 * Did this PATCH body carry targeting at all?
 *
 * PATCH routes must replace the whole audience or none of it: `sanitizeTaskAudience`
 * returns all nine keys with empty defaults, so applying it to a body that never
 * mentioned targeting would silently CLEAR an existing audience.
 */
export function hasAudienceKeys(body: Record<string, unknown>): boolean {
  return TASK_AUDIENCE_KEYS.some((k) => body[k] !== undefined);
}

/** An audience with nothing set (used when a gate strips targeting). */
export const EMPTY_TASK_AUDIENCE: TaskAudienceInput = {
  countries: [],
  genders: [],
  regions: [],
  divisions: [],
  districts: [],
  subDistricts: [],
  postalCodes: [],
  minAge: null,
  maxAge: null,
};

/** Does this task restrict its audience at all? (for admin preview / badges) */
export function hasAudienceTargeting(task: TaskAudience): boolean {
  return (
    task.countries.length > 0 ||
    task.genders.length > 0 ||
    task.regions.length > 0 ||
    task.divisions.length > 0 ||
    task.districts.length > 0 ||
    task.subDistricts.length > 0 ||
    task.postalCodes.length > 0 ||
    task.minAge != null ||
    task.maxAge != null
  );
}
