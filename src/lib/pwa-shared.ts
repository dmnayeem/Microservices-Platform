/**
 * Installed-app (PWA) tracking — the client-safe half (no prisma).
 *
 * The server half, which counts days and pays the install reward, is
 * src/lib/pwa-install.ts. Platform detection lives here so the beacon and
 * scripts/verify-pwa-install.ts run the exact same function.
 */

export type PwaPlatform = "android" | "ios" | "desktop" | "other";
export const PWA_PLATFORMS: PwaPlatform[] = ["android", "ios", "desktop", "other"];

export const PWA_PLATFORM_LABEL: Record<PwaPlatform, string> = {
  android: "Android",
  ios: "iPhone / iPad",
  desktop: "Desktop",
  other: "Other",
};

/** How the page is being shown. Only these count as "opened the installed app". */
export const PWA_DISPLAY_MODES = ["standalone", "ios-standalone", "twa"] as const;
export type PwaDisplayMode = (typeof PWA_DISPLAY_MODES)[number];

/** Settings keys (saved through /api/admin/settings, bounded in setting-guards.ts). */
export const PWA_SETTING_KEYS = {
  enabled: "pwa.install_reward_enabled",
  points: "pwa.install_reward_points",
  minDays: "pwa.install_reward_min_days",
} as const;

export const PWA_REWARD_DEFAULTS = { enabled: false, points: 0, minDays: 2 } as const;

export interface PwaRewardConfig {
  enabled: boolean;
  points: number;
  minDays: number;
}

/** Coerce stored setting values into a safe config. Never pays on a bad value. */
export function normalizePwaRewardConfig(raw: {
  enabled?: unknown;
  points?: unknown;
  minDays?: unknown;
}): PwaRewardConfig {
  const enabled = raw.enabled === true || raw.enabled === "true";
  const p = Math.floor(Number(raw.points));
  const points = Number.isFinite(p) && p > 0 ? Math.min(p, 100_000) : 0;
  const d = Math.floor(Number(raw.minDays));
  // Never below 1, whatever is stored: 0 would pay on no evidence at all.
  const minDays = Number.isFinite(d) && d >= 1 ? Math.min(d, 30) : PWA_REWARD_DEFAULTS.minDays;
  return { enabled, points, minDays };
}

/** What the user-side card needs. */
export interface PwaRewardStatus {
  /** Reward switched on AND worth something AND this user may receive it. */
  offered: boolean;
  points: number;
  minDays: number;
  /** Distinct days the installed app has been opened. */
  days: number;
  installed: boolean;
  rewarded: boolean;
}

/**
 * Which platform a browser runs on.
 *
 * `uaDataPlatform` is `navigator.userAgentData.platform` where the browser has
 * it (Chromium) — more trustworthy than the UA string. iPadOS 13+ reports a
 * desktop Mac UA, so a "Macintosh" with touch points is an iPad.
 * Android is checked before desktop because an Android UA also says "Linux".
 */
export function detectPwaPlatform(
  ua: string | null | undefined,
  hints: { uaDataPlatform?: string | null; maxTouchPoints?: number | null } = {}
): PwaPlatform {
  const p = (hints.uaDataPlatform ?? "").toLowerCase();
  if (p) {
    if (p === "android") return "android";
    if (p === "ios" || p === "ipados") return "ios";
    if (p === "windows" || p === "macos" || p === "linux" || p === "chrome os" || p === "chromeos")
      return "desktop";
  }
  const s = (ua ?? "").toLowerCase();
  if (!s) return "other";
  if (/android/.test(s)) return "android";
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/macintosh/.test(s) && (hints.maxTouchPoints ?? 0) > 1) return "ios";
  if (/windows nt|macintosh|mac os x|cros|x11|linux/.test(s)) return "desktop";
  return "other";
}

/** Server-side: accept only a known platform. */
export function parsePwaPlatform(v: unknown): PwaPlatform {
  return typeof v === "string" && (PWA_PLATFORMS as string[]).includes(v) ? (v as PwaPlatform) : "other";
}

/** Server-side: a bare host name (optionally :port), lower-cased, or null. */
export function parsePwaHost(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().toLowerCase();
  return /^[a-z0-9.-]{1,100}(:\d{1,5})?$/.test(h) ? h : null;
}
