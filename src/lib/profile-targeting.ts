/**
 * The profile fields that decide which targeted tasks a user is served, and the
 * rules for changing them.
 *
 * Two problems this addresses.
 *
 * **The values didn't line up.** Task targeting stores `genders` upper-cased to
 * MALE / FEMALE / OTHER (`sanitizeTaskAudience`) and matches with `{ has: value }`
 * — a case-SENSITIVE array containment. The profile accepted `gender` as free
 * text up to 200 characters, so a user who typed "male" could never match a task
 * targeting ["MALE"]. Meanwhile `audienceWhere()` (notifications, broadcasts)
 * matches gender with `mode: "insensitive"`, so the very same audience
 * definition selected two different populations depending on which system read
 * it. Normalising on write makes both agree.
 *
 * **Nothing stopped a user retargeting themselves.** All nine dimensions were
 * freely editable, unvalidated, unlimited and unaudited — so the play was:
 * change country to match a high-paying geo-targeted task, complete it, change
 * back. A cooldown does not make that impossible, but it makes it slow enough to
 * be pointless and leaves a trail to find it by.
 *
 * Prisma-free so it can be unit-verified and reused on the client.
 */

/** Fields that feed `taskAudienceWhere()` / `matchesTaskAudience()`. */
export const TARGETING_PROFILE_FIELDS = [
  "country",
  "region",
  "division",
  "district",
  "subDistrict",
  "postalCode",
  "gender",
  "dateOfBirth",
] as const;

export type TargetingProfileField = (typeof TARGETING_PROFILE_FIELDS)[number];

/**
 * How long a user must wait between changes to their targeting attributes.
 *
 * Long enough that flipping country to grab a task and flipping back is not
 * worth it; short enough that someone who genuinely moved, or mistyped their
 * date of birth, is not stuck for long. An admin can always edit a profile.
 */
export const TARGETING_CHANGE_COOLDOWN_DAYS = 7;
export const TARGETING_CHANGE_COOLDOWN_MS =
  TARGETING_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Canonical gender values — the same three `sanitizeTaskAudience` produces.
 * Anything else is stored as null rather than as text that can never match.
 */
export function normalizeGender(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toUpperCase();
  if (v === "MALE" || v === "M") return "MALE";
  if (v === "FEMALE" || v === "F") return "FEMALE";
  if (v === "OTHER" || v === "O") return "OTHER";
  if (!v) return null;
  // Not one of the three: keep it out of the targeting columns rather than
  // storing a value that silently matches nothing.
  return null;
}

export interface DobResult {
  ok: boolean;
  value?: Date | null;
  error?: string;
}

/**
 * A date of birth that could belong to a living person. Age drives targeting, so
 * an unvalidated value here is a targeting bypass as much as a data-quality
 * problem — `new Date("banana")` produced an Invalid Date that was written
 * straight to the column.
 */
export function parseDateOfBirth(raw: unknown): DobResult {
  if (raw === null || raw === "") return { ok: true, value: null };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "That date of birth isn't a valid date." };
  }
  const now = Date.now();
  if (d.getTime() > now) {
    return { ok: false, error: "Date of birth can't be in the future." };
  }
  const age = (now - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age > 120) {
    return { ok: false, error: "Please check your date of birth." };
  }
  return { ok: true, value: d };
}

/** Which targeting fields would actually change, given a patch. */
export function changedTargetingFields(
  current: Partial<Record<TargetingProfileField, unknown>>,
  patch: Partial<Record<TargetingProfileField, unknown>>
): TargetingProfileField[] {
  const out: TargetingProfileField[] = [];
  for (const f of TARGETING_PROFILE_FIELDS) {
    if (!(f in patch)) continue;
    const a = current[f];
    const b = patch[f];
    const norm = (v: unknown) =>
      v instanceof Date ? v.getTime() : v === "" ? null : (v ?? null);
    if (norm(a) !== norm(b)) out.push(f);
  }
  return out;
}
