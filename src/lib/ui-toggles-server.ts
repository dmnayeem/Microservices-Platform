import { prisma } from "@/lib/prisma";

export interface UiToggles {
  cookiesPopup: boolean;
  notificationPopup: boolean;
  pwaInstallPrompt: boolean;
  /** When true, users must complete their core profile to use Tasks & Missions. */
  requireProfileCompletion: boolean;
  /** When true, all withdrawals require KYC; when false only withdrawals >$100 do. */
  requireKycForWithdrawal: boolean;
  /** When true, a user must have a verified email before they can log in. */
  requireEmailVerification: boolean;
  /**
   * Groups: the tab on the social feed, the group pages, and the whole
   * `/api/groups` surface. OFF ships the feature dark rather than deleting it —
   * every Group, member and group post stays in the database untouched.
   */
  groupsEnabled: boolean;
  /**
   * The theme everyone gets unless they have chosen otherwise AND are allowed
   * to choose. This is also the theme a user is forced back to the moment
   * `themeUserChoice` goes off, so turning choice off is a real lever and not
   * just a hidden button.
   */
  themeDefault: "dark" | "light";
  /**
   * Whether a user may change the theme at all. Off hides the switch in the
   * header and in Settings, and the pre-paint script stops reading the stored
   * preference — a user who had picked light sees the admin's default instead.
   */
  themeUserChoice: boolean;
}

const KEYS = {
  cookiesPopup: "ui.cookies_popup_enabled",
  notificationPopup: "ui.notification_popup_enabled",
  pwaInstallPrompt: "ui.pwa_install_prompt_enabled",
  requireProfileCompletion: "ui.require_profile_completion",
  requireKycForWithdrawal: "ui.require_kyc_for_withdrawal",
  requireEmailVerification: "ui.require_email_verification",
  groupsEnabled: "ui.groups_enabled",
  themeDefault: "ui.theme_default",
  themeUserChoice: "ui.theme_user_choice",
} as const;

const DEFAULTS: UiToggles = {
  cookiesPopup: true,
  notificationPopup: true,
  pwaInstallPrompt: true,
  // OFF by default — nothing changes for users until an admin turns it on.
  requireProfileCompletion: false,
  // ON by default — KYC is required to withdraw.
  requireKycForWithdrawal: true,
  // OFF by default — don't block login on email verification unless an admin
  // opts in. Google OAuth accounts are auto-verified regardless.
  requireEmailVerification: false,
  // OFF by default. The owner asked for Groups to ship dark, and a false default
  // means that needs no row in `SystemSetting` at all — the absence of the
  // setting IS the off state. Turning it on later is one toggle in
  // /admin/settings and the two existing groups come straight back.
  groupsEnabled: false,
  // Dark by default, and users may choose — which is exactly how the app
  // behaved before these two settings existed, so an install with no rows in
  // `SystemSetting` is unchanged by this feature.
  themeDefault: "dark",
  themeUserChoice: true,
};

function asTheme(v: unknown, fallback: "dark" | "light"): "dark" | "light" {
  const unwrapped =
    v && typeof v === "object" && "v" in (v as object)
      ? (v as { v: unknown }).v
      : v;
  return unwrapped === "light" || unwrapped === "dark" ? unwrapped : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  // Settings may be stored as raw booleans or wrapped as { v: boolean }.
  const unwrapped =
    v && typeof v === "object" && "v" in (v as object)
      ? (v as { v: unknown }).v
      : v;
  return typeof unwrapped === "boolean" ? unwrapped : fallback;
}

// In-process memo so the RootLayout (which reads this on every server render)
// doesn't pay a DB/Accelerate round-trip per navigation. Admin changes still
// apply within CACHE_MS.
const CACHE_MS = 60_000;
let _cache: { value: UiToggles; ts: number } | null = null;

/**
 * Drop the memo. The settings save route calls this, because without it an
 * admin flips a switch, the row is written, and nothing changes for up to a
 * minute — which reads exactly like a control that does nothing, and this
 * platform has shipped 44 of those before.
 */
export function invalidateUiTogglesCache(): void {
  _cache = null;
}

/**
 * Read the admin ON/OFF toggles: the site-wide popups (cookie consent,
 * notification permission prompt, PWA install prompt), the signup/withdrawal
 * requirements, and the Groups feature switch. Each falls back to its entry in
 * `DEFAULTS` when unset or the DB is unreachable. Memoized in-process (~60s) and
 * cached at the edge via Accelerate for cold reads.
 */
export async function getUiToggles(): Promise<UiToggles> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.value;
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { category: "ui_toggles" },
      cacheStrategy: { ttl: 60, swr: 120 },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const value: UiToggles = {
      cookiesPopup: asBool(map.get(KEYS.cookiesPopup), DEFAULTS.cookiesPopup),
      notificationPopup: asBool(
        map.get(KEYS.notificationPopup),
        DEFAULTS.notificationPopup
      ),
      pwaInstallPrompt: asBool(
        map.get(KEYS.pwaInstallPrompt),
        DEFAULTS.pwaInstallPrompt
      ),
      requireProfileCompletion: asBool(
        map.get(KEYS.requireProfileCompletion),
        DEFAULTS.requireProfileCompletion
      ),
      requireKycForWithdrawal: asBool(
        map.get(KEYS.requireKycForWithdrawal),
        DEFAULTS.requireKycForWithdrawal
      ),
      requireEmailVerification: asBool(
        map.get(KEYS.requireEmailVerification),
        DEFAULTS.requireEmailVerification
      ),
      groupsEnabled: asBool(map.get(KEYS.groupsEnabled), DEFAULTS.groupsEnabled),
      themeDefault: asTheme(map.get(KEYS.themeDefault), DEFAULTS.themeDefault),
      themeUserChoice: asBool(
        map.get(KEYS.themeUserChoice),
        DEFAULTS.themeUserChoice
      ),
    };
    _cache = { value, ts: Date.now() };
    return value;
  } catch {
    // Cache the fallback briefly too, so a transient DB error doesn't cause a
    // retry storm on every render.
    _cache = { value: DEFAULTS, ts: Date.now() };
    return DEFAULTS;
  }
}
