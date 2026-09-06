/**
 * Profile completion calculator.
 * Returns a percentage + list of missing fields so the UI can show users
 * exactly what's left to fill in.
 */

export interface ProfileSnapshot {
  // Basic
  avatar?: string | null;
  coverPhoto?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | null;
  nidNumber?: string | null;
  // Contact
  emailVerified?: Date | null;
  phone?: string | null;
  phoneVerified?: Date | null;
  // Address
  country?: string | null;
  city?: string | null;
  street?: string | null;
  postalCode?: string | null;
  // Verification
  kycStatus?: string;
  // Other
  tags?: string[] | null;
  socialAccountsCount?: number;
}

export interface CompletionItem {
  key: string;
  label: string;
  category: "basic" | "contact" | "address" | "verification" | "social";
  done: boolean;
  weight: number;
  /**
   * Where this item is actually edited.
   *
   * Every item used to say `?tab=personal`, which was wrong for most of them:
   * the profile photo and cover are set in a modal on the header, tags in
   * another modal, and the National ID sits on the personal tab rather than the
   * KYC one. Clicking "Profile photo" opened a form that has no photo control
   * on it, so the list pointed people away from the thing it was asking for.
   *
   * Grammar:
   *   ?modal=photo&which=avatar|coverPhoto   → the header photo picker
   *   ?modal=tags                            → the tag picker
   *   ?tab=<editTab>[&field=<anchor>]        → edit panel, scrolled to a field
   *   /some/path                             → its own page (verification flows)
   */
  href?: string;
}

export interface CompletionResult {
  percentage: number;
  totalWeight: number;
  filledWeight: number;
  items: CompletionItem[];
  missing: CompletionItem[];
}

const has = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return v > 0;
  return Boolean(v);
};

export function calculateProfileCompletion(p: ProfileSnapshot): CompletionResult {
  const items: CompletionItem[] = [
    // Basic — heaviest weight (this is what people see first)
    { key: "avatar", label: "Profile photo", category: "basic", weight: 8, done: has(p.avatar), href: "?modal=photo&which=avatar" },
    { key: "coverPhoto", label: "Cover photo", category: "basic", weight: 4, done: has(p.coverPhoto), href: "?modal=photo&which=coverPhoto" },
    { key: "firstName", label: "First name", category: "basic", weight: 5, done: has(p.firstName), href: "?tab=personal&field=firstName" },
    { key: "lastName", label: "Last name", category: "basic", weight: 5, done: has(p.lastName), href: "?tab=personal&field=lastName" },
    { key: "bio", label: "Bio", category: "basic", weight: 6, done: has(p.bio), href: "?tab=personal&field=bio" },
    { key: "gender", label: "Gender", category: "basic", weight: 3, done: has(p.gender), href: "?tab=personal&field=gender" },
    { key: "dateOfBirth", label: "Date of birth", category: "basic", weight: 4, done: has(p.dateOfBirth), href: "?tab=personal&field=dateOfBirth" },
    { key: "tags", label: "Profile tags", category: "basic", weight: 3, done: (p.tags?.length ?? 0) > 0, href: "?modal=tags" },
    // Contact
    // Their own pages — there is no email/phone verification control on any
    // profile tab, so pointing at one would just be a different wrong door.
    { key: "emailVerified", label: "Verified email", category: "contact", weight: 8, done: has(p.emailVerified), href: "/verify-email" },
    { key: "phone", label: "Phone number", category: "contact", weight: 5, done: has(p.phone), href: "?tab=personal&field=phone" },
    { key: "phoneVerified", label: "Verified phone", category: "contact", weight: 6, done: has(p.phoneVerified), href: "/verify-phone" },
    // Address — the whole tab is one short form built from a shared location
    // picker, so there is no per-field anchor to claim. Landing on the tab IS
    // the specific destination here.
    { key: "country", label: "Country", category: "address", weight: 5, done: has(p.country), href: "?tab=address" },
    { key: "city", label: "City", category: "address", weight: 3, done: has(p.city), href: "?tab=address" },
    { key: "street", label: "Street address", category: "address", weight: 3, done: has(p.street), href: "?tab=address" },
    { key: "postalCode", label: "Postal code", category: "address", weight: 2, done: has(p.postalCode), href: "?tab=address" },
    // Verification — KYC is intentionally NOT part of profile completion; it's a
    // separate identity step (prompted after the profile is complete, required
    // only for withdrawals). The ring reflects profile fields only.
    { key: "nidNumber", label: "National ID number", category: "verification", weight: 4, done: has(p.nidNumber), href: "?tab=personal&field=nidNumber" },
    // Social
    { key: "social", label: "At least 1 social account connected", category: "social", weight: 5, done: (p.socialAccountsCount ?? 0) > 0, href: "?tab=social" },
    { key: "socialThree", label: "3+ social accounts connected", category: "social", weight: 4, done: (p.socialAccountsCount ?? 0) >= 3, href: "?tab=social" },
  ];

  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  const filledWeight = items.filter((it) => it.done).reduce((s, it) => s + it.weight, 0);
  const percentage = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;

  return {
    percentage,
    totalWeight,
    filledWeight,
    items,
    missing: items.filter((it) => !it.done),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core "essentials" used to UNLOCK Tasks & Missions (admin-gated). These are
// achievable for every user — KYC and social accounts stay bonus-only on the
// full ring above, and are NOT required here.
// ─────────────────────────────────────────────────────────────────────────────

export type RequiredSnapshot = Pick<
  ProfileSnapshot,
  "avatar" | "firstName" | "lastName" | "dateOfBirth" | "gender" | "country" | "phone"
>;

interface RequiredItem {
  key: keyof RequiredSnapshot;
  label: string;
  href: string;
}

export const UNLOCK_REQUIRED: RequiredItem[] = [
  // Same destinations as the completion list above — the photo is a modal on
  // the header, not a field on the personal form.
  { key: "avatar", label: "Profile photo", href: "/profile?modal=photo&which=avatar" },
  { key: "firstName", label: "First name", href: "/profile?tab=personal&field=firstName" },
  { key: "lastName", label: "Last name", href: "/profile?tab=personal&field=lastName" },
  { key: "dateOfBirth", label: "Date of birth", href: "/profile?tab=personal&field=dateOfBirth" },
  { key: "gender", label: "Gender", href: "/profile?tab=personal&field=gender" },
  { key: "phone", label: "Phone number", href: "/profile?tab=personal&field=phone" },
  { key: "country", label: "Country", href: "/profile?tab=address" },
];

/** True when all core essentials are filled (used to unlock Tasks/Missions). */
export function isProfileComplete(p: RequiredSnapshot): boolean {
  return UNLOCK_REQUIRED.every((it) => has(p[it.key]));
}

export interface RequiredProgress {
  done: number;
  total: number;
  percentage: number;
  complete: boolean;
  missing: RequiredItem[];
}

/** Progress across the core essentials — for the locked screen + nudge banner. */
export function requiredProfileProgress(p: RequiredSnapshot): RequiredProgress {
  const missing = UNLOCK_REQUIRED.filter((it) => !has(p[it.key]));
  const total = UNLOCK_REQUIRED.length;
  const done = total - missing.length;
  return {
    done,
    total,
    percentage: total > 0 ? Math.round((done / total) * 100) : 100,
    complete: missing.length === 0,
    missing,
  };
}
