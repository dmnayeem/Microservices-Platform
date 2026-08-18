// Client-safe ad-targeting types + a pure matcher. NO server imports here so
// the advertiser/admin ad forms (client components) can reuse the type + parser.
// Both serve paths (/api/ads/serve banner + /api/ads/feed native) use
// `matchesTargeting` to decide who sees an ad.

/** Audience rules stored on Ad.targeting (JSON). All present rules must match
 *  (AND). An empty/missing rule = no constraint on that dimension. */
export interface AdTargeting {
  countries?: string[]; // User.country (case-insensitive)
  cities?: string[]; // User.city (case-insensitive)
  genders?: string[]; // User.gender (MALE/FEMALE/OTHER)
  minAge?: number; // from User.dateOfBirth
  maxAge?: number;
  minLevel?: number; // User.level
  maxLevel?: number;
  packages?: string[]; // effective package slug
  kycStatuses?: string[]; // User.kycStatus
  verifiedOnly?: boolean; // User.isBlueVerified
  tags?: string[]; // User.tags intersects (any-of)
  languages?: string[]; // User.language
  minAccountAgeDays?: number; // from User.createdAt
  activeWithinDays?: number; // User.lastLoginAt recency
}

/** The viewer attributes we target on. */
export interface TargetableUser {
  country?: string | null;
  city?: string | null;
  gender?: string | null;
  level?: number | null;
  packageSlug?: string | null;
  dateOfBirth?: Date | string | null;
  kycStatus?: string | null;
  isBlueVerified?: boolean | null;
  tags?: string[] | null;
  language?: string | null;
  createdAt?: Date | string | null;
  lastLoginAt?: Date | string | null;
}

// ── Option constants for the admin targeting UI ──────────────────────────────
export const GENDER_OPTIONS = ["MALE", "FEMALE", "OTHER"] as const;
export const KYC_OPTIONS = [
  "NOT_SUBMITTED",
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export const TAG_OPTIONS = [
  "EARLY_ADOPTER",
  "VERIFIED",
  "CRYPTO",
  "TRADER",
  "GAMER",
  "INFLUENCER",
  "WHALE",
  "PRO",
  "ELITE",
  "CREATOR",
] as const;
export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "bn", label: "Bengali" },
  { code: "hi", label: "Hindi" },
  { code: "ur", label: "Urdu" },
  { code: "es", label: "Spanish" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
  { code: "id", label: "Indonesian" },
  { code: "ru", label: "Russian" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
] as const;

/** Interests = the canonical profile tags (User.tags), with label + emoji for a
 *  searchable picker. IDs match the profile TAG_OPTIONS. */
export const INTEREST_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "EARLY_ADOPTER", label: "Early Adopter", emoji: "🚀" },
  { id: "VERIFIED", label: "Verified", emoji: "✓" },
  { id: "CRYPTO", label: "Crypto", emoji: "₿" },
  { id: "TRADER", label: "Trader", emoji: "📈" },
  { id: "GAMER", label: "Gamer", emoji: "🎮" },
  { id: "INFLUENCER", label: "Influencer", emoji: "📣" },
  { id: "WHALE", label: "Whale", emoji: "🐋" },
  { id: "PRO", label: "Pro", emoji: "🏆" },
  { id: "ELITE", label: "Elite", emoji: "💎" },
  { id: "CREATOR", label: "Creator", emoji: "🎨" },
];

/** Countries the platform serves — code + name + flag. `User.country` stores the
 *  code. Shared by profile, settings and the ad audience builder. */
export const COUNTRY_OPTIONS: { code: string; name: string; flag: string }[] = [
  { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "PK", name: "Pakistan", flag: "🇵🇰" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "MY", name: "Malaysia", flag: "🇲🇾" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "TH", name: "Thailand", flag: "🇹🇭" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "NP", name: "Nepal", flag: "🇳🇵" },
  { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬" },
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦" },
  { code: "KE", name: "Kenya", flag: "🇰🇪" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "RU", name: "Russia", flag: "🇷🇺" },
  { code: "CN", name: "China", flag: "🇨🇳" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
];

// ── helpers ──────────────────────────────────────────────────────────────────
function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function ageFromDob(dob: Date | string | null | undefined, now: Date): number | null {
  const d = toDate(dob);
  if (!d) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function daysSince(v: Date | string | null | undefined, now: Date): number | null {
  const d = toDate(v);
  if (!d) return null;
  return (now.getTime() - d.getTime()) / 86_400_000;
}

function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : undefined;
}
function posNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Safely read stored `targeting` JSON into a typed object. */
export function parseTargeting(v: unknown): AdTargeting {
  if (!v || typeof v !== "object") return {};
  const s = v as Record<string, unknown>;
  const out: AdTargeting = {};
  if (strArr(s.countries)?.length) out.countries = strArr(s.countries);
  if (strArr(s.cities)?.length) out.cities = strArr(s.cities);
  if (strArr(s.genders)?.length) out.genders = strArr(s.genders);
  if (posNum(s.minAge)) out.minAge = posNum(s.minAge);
  if (posNum(s.maxAge)) out.maxAge = posNum(s.maxAge);
  if (posNum(s.minLevel)) out.minLevel = posNum(s.minLevel);
  if (posNum(s.maxLevel)) out.maxLevel = posNum(s.maxLevel);
  if (strArr(s.packages)?.length) out.packages = strArr(s.packages);
  if (strArr(s.kycStatuses)?.length) out.kycStatuses = strArr(s.kycStatuses);
  if (s.verifiedOnly === true) out.verifiedOnly = true;
  if (strArr(s.tags)?.length) out.tags = strArr(s.tags);
  if (strArr(s.languages)?.length) out.languages = strArr(s.languages);
  if (posNum(s.minAccountAgeDays)) out.minAccountAgeDays = posNum(s.minAccountAgeDays);
  if (posNum(s.activeWithinDays)) out.activeWithinDays = posNum(s.activeWithinDays);
  return out;
}

/** Normalize to null when there are no active rules ("everyone"). */
export function normalizeTargeting(t: AdTargeting): AdTargeting | null {
  const clean = parseTargeting(t);
  return Object.keys(clean).length > 0 ? clean : null;
}

/** True if the viewer satisfies every set targeting rule. Empty = everyone. */
export function matchesTargeting(
  targeting: unknown,
  user: TargetableUser
): boolean {
  const t = parseTargeting(targeting);
  const now = new Date();

  if (t.countries?.length) {
    const c = (user.country ?? "").toLowerCase();
    if (!t.countries.some((x) => x.toLowerCase() === c)) return false;
  }
  if (t.cities?.length) {
    const c = (user.city ?? "").toLowerCase();
    if (!t.cities.some((x) => x.toLowerCase() === c)) return false;
  }
  if (t.genders?.length) {
    const g = (user.gender ?? "").toUpperCase();
    if (!t.genders.some((x) => x.toUpperCase() === g)) return false;
  }
  if (t.minAge || t.maxAge) {
    const age = ageFromDob(user.dateOfBirth, now);
    if (age === null) return false;
    if (t.minAge && age < t.minAge) return false;
    if (t.maxAge && age > t.maxAge) return false;
  }
  if (t.minLevel && (user.level ?? 0) < t.minLevel) return false;
  if (t.maxLevel && (user.level ?? 0) > t.maxLevel) return false;
  if (t.packages?.length) {
    if (!t.packages.includes(user.packageSlug ?? "")) return false;
  }
  if (t.kycStatuses?.length) {
    const k = (user.kycStatus ?? "").toUpperCase();
    if (!t.kycStatuses.some((x) => x.toUpperCase() === k)) return false;
  }
  if (t.verifiedOnly && !user.isBlueVerified) return false;
  if (t.tags?.length) {
    const userTags = (user.tags ?? []).map((x) => x.toUpperCase());
    if (!t.tags.some((x) => userTags.includes(x.toUpperCase()))) return false;
  }
  if (t.languages?.length) {
    const l = (user.language ?? "").toLowerCase();
    if (!t.languages.some((x) => x.toLowerCase() === l)) return false;
  }
  if (t.minAccountAgeDays) {
    const d = daysSince(user.createdAt, now);
    if (d === null || d < t.minAccountAgeDays) return false;
  }
  if (t.activeWithinDays) {
    const d = daysSince(user.lastLoginAt, now);
    if (d === null || d > t.activeWithinDays) return false;
  }
  return true;
}
