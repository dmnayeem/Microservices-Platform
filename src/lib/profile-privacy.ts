/**
 * Who can see each piece of a profile.
 *
 * Five things already had their own column — avatar, bio, stats, earnings,
 * location — and the rest of the profile had nothing: publishing profession,
 * gender, birthday, blood group and the rest made them visible to everyone with
 * no way for the person to say otherwise. This adds that control without adding
 * a column per field: `User.privacyFields` is one JSON map of
 * `fieldKey -> level`, and the five legacy columns stay authoritative for their
 * own items so nothing that works today changes meaning.
 *
 * Client-safe: no imports, so the settings UI and the public API read the same
 * catalogue. A field the UI can set but the API does not enforce is worse than
 * no setting at all — it tells someone their birthday is hidden while it is
 * still on the page.
 */

export type PrivacyLevel = "PUBLIC" | "FRIENDS" | "PRIVATE";

export const PRIVACY_LEVELS: PrivacyLevel[] = ["PUBLIC", "FRIENDS", "PRIVATE"];

/** What each level means, in the words the user sees. */
export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC: "Everyone",
  FRIENDS: "Followers",
  PRIVATE: "Only me",
};

export const PRIVACY_HINTS: Record<PrivacyLevel, string> = {
  PUBLIC: "Anyone who opens your profile",
  // "Followers" here means MUTUAL: they follow you and you follow them. A
  // one-way follower is not somebody you chose.
  FRIENDS: "People you follow who also follow you",
  PRIVATE: "Nobody but you",
};

export interface PrivacyField {
  /** Key in `privacyFields`, or the legacy column it maps to. */
  key: string;
  label: string;
  hint: string;
  group: "Profile" | "Personal" | "Activity";
  /**
   * The legacy `User.privacy*` column that owns this item, if any. Those five
   * keep working exactly as before; everything else lives in the JSON map.
   */
  column?: "privacyAvatar" | "privacyBio" | "privacyStats" | "privacyEarnings" | "privacyLocation";
  /** Level applied when the user has never touched this field. */
  fallback: PrivacyLevel;
}

/**
 * Every controllable item, in the order the settings page shows them.
 *
 * Defaults match what is live today rather than what is most private: these
 * fields are public right now, and silently hiding somebody's profession the
 * day this ships would be a change they did not ask for. The point of this is
 * that restricting one is now a single click.
 */
export const PRIVACY_FIELDS: PrivacyField[] = [
  // ── The five that already had columns ──
  { key: "avatar", label: "Profile photo", hint: "Your avatar", group: "Profile", column: "privacyAvatar", fallback: "PUBLIC" },
  { key: "bio", label: "Bio", hint: "Your about-me text", group: "Profile", column: "privacyBio", fallback: "PUBLIC" },
  { key: "location", label: "Location", hint: "City, district and country", group: "Profile", column: "privacyLocation", fallback: "FRIENDS" },
  { key: "stats", label: "Stats", hint: "Level, XP, rank, tasks, team", group: "Activity", column: "privacyStats", fallback: "PUBLIC" },
  { key: "earnings", label: "Earnings", hint: "Lifetime earnings figures", group: "Activity", column: "privacyEarnings", fallback: "PRIVATE" },

  // ── Everything else, previously always-on ──
  { key: "profession", label: "Profession", hint: "What you do", group: "Profile", fallback: "PUBLIC" },
  { key: "nationality", label: "Nationality", hint: "Where you are from", group: "Profile", fallback: "PUBLIC" },
  { key: "language", label: "Language", hint: "What you speak", group: "Profile", fallback: "PUBLIC" },
  { key: "timezone", label: "Timezone", hint: "Roughly when you are online", group: "Profile", fallback: "PUBLIC" },
  { key: "gender", label: "Gender", hint: "Shown on your profile", group: "Personal", fallback: "PUBLIC" },
  { key: "dateOfBirth", label: "Birthday", hint: "Your date of birth", group: "Personal", fallback: "PUBLIC" },
  { key: "bloodGroup", label: "Blood group", hint: "Shown on your profile", group: "Personal", fallback: "PUBLIC" },
  { key: "maritalStatus", label: "Marital status", hint: "Shown on your profile", group: "Personal", fallback: "PUBLIC" },
  { key: "studyLevel", label: "Education", hint: "Your study level", group: "Personal", fallback: "PUBLIC" },
  { key: "socialAccounts", label: "Connected accounts", hint: "The social accounts you linked", group: "Activity", fallback: "PUBLIC" },
  { key: "creations", label: "Courses & listings", hint: "What you have published", group: "Activity", fallback: "PUBLIC" },
];

const BY_KEY = new Map(PRIVACY_FIELDS.map((f) => [f.key, f]));

export const PRIVACY_GROUPS = ["Profile", "Personal", "Activity"] as const;

function isLevel(v: unknown): v is PrivacyLevel {
  return v === "PUBLIC" || v === "FRIENDS" || v === "PRIVATE";
}

/** Normalise whatever is in the JSON column into a clean map. */
export function parsePrivacyFields(raw: unknown): Record<string, PrivacyLevel> {
  const out: Record<string, PrivacyLevel> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // Unknown keys are dropped rather than kept: a stale key is a setting the
    // user believes is doing something.
    if (BY_KEY.has(k) && isLevel(v)) out[k] = v;
  }
  return out;
}

export interface PrivacySource {
  privacyAvatar?: string | null;
  privacyBio?: string | null;
  privacyStats?: string | null;
  privacyEarnings?: string | null;
  privacyLocation?: string | null;
  privacyFields?: unknown;
}

/**
 * The level in force for one field.
 *
 * Legacy column first when the field has one — those are what the existing
 * settings write, and two sources for one answer must have a stated winner.
 */
export function privacyLevelFor(
  user: PrivacySource,
  key: string
): PrivacyLevel {
  const field = BY_KEY.get(key);
  if (!field) return "PUBLIC";
  if (field.column) {
    const v = user[field.column];
    return isLevel(v) ? v : field.fallback;
  }
  const map = parsePrivacyFields(user.privacyFields);
  return map[key] ?? field.fallback;
}

/** Every field's effective level — what the settings page renders. */
export function effectivePrivacy(user: PrivacySource): Record<string, PrivacyLevel> {
  const out: Record<string, PrivacyLevel> = {};
  for (const f of PRIVACY_FIELDS) out[f.key] = privacyLevelFor(user, f.key);
  return out;
}

export interface ViewerContext {
  /** The person is looking at their own profile. */
  isMe: boolean;
  /** Viewer follows them AND they follow the viewer back. */
  isMutual: boolean;
}

/** Does this viewer get to see a field at this level? */
export function canSee(level: PrivacyLevel, viewer: ViewerContext): boolean {
  if (viewer.isMe) return true;
  if (level === "PUBLIC") return true;
  if (level === "PRIVATE") return false;
  return viewer.isMutual;
}

/** The two combined — the only call a route should need. */
export function visibleTo(
  user: PrivacySource,
  key: string,
  viewer: ViewerContext
): boolean {
  return canSee(privacyLevelFor(user, key), viewer);
}
