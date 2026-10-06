/**
 * Site popups (/admin/popups) — the shared vocabulary. Client-safe: no Prisma.
 *
 * Who sees a popup is decided in two places on purpose:
 *   - the server (api/popups) applies the schedule, the page, signed-in vs
 *     visitor and the audience targeting — the private facts about a person
 *     never leave the server;
 *   - the browser applies the frequency ("once", "once a day", …), because
 *     "has this person already seen it" is only known on their device.
 */

export const POPUP_KINDS = ["NOTICE", "IMAGE", "VIDEO", "HTML", "AD"] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

export const POPUP_PLACEMENTS = ["ALL", "APP", "SITE", "PATHS"] as const;
export type PopupPlacement = (typeof POPUP_PLACEMENTS)[number];

export const POPUP_SESSION_AUDIENCES = ["ANY", "SIGNED_IN", "VISITORS"] as const;
export type PopupSessionAudience = (typeof POPUP_SESSION_AUDIENCES)[number];

export const POPUP_FREQUENCIES = ["ONCE", "DAILY", "SESSION", "ALWAYS"] as const;
export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number];

export const POPUP_KIND_LABEL: Record<PopupKind, string> = {
  NOTICE: "Notice (text + image + buttons)",
  IMAGE: "Image (the picture is the popup)",
  VIDEO: "Video (one or several)",
  HTML: "HTML / ad code",
  AD: "Ad (notice with a Sponsored label)",
};

export const POPUP_SIZES = ["SMALL", "MEDIUM", "LARGE", "FULL"] as const;
export type PopupSize = (typeof POPUP_SIZES)[number];
export const POPUP_SIZE_LABEL: Record<PopupSize, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  FULL: "Full screen",
};

export const POPUP_DEVICES = ["MOBILE", "TABLET", "DESKTOP"] as const;
export type PopupDevice = (typeof POPUP_DEVICES)[number];
export const POPUP_DEVICE_LABEL: Record<PopupDevice, string> = {
  MOBILE: "Mobile",
  TABLET: "Tablet",
  DESKTOP: "Laptop / desktop",
};
/** The device class of a viewport width — the same breakpoints the app uses. */
export function popupDeviceOfWidth(width: number): PopupDevice {
  if (width < 640) return "MOBILE";
  if (width < 1024) return "TABLET";
  return "DESKTOP";
}

export const POPUP_PLAN_AUDIENCES = ["ANY", "FREE", "PAID"] as const;
export type PopupPlanAudience = (typeof POPUP_PLAN_AUDIENCES)[number];
export const POPUP_PLAN_AUDIENCE_LABEL: Record<PopupPlanAudience, string> = {
  ANY: "Any plan",
  FREE: "Free plan only",
  PAID: "Paid plans only",
};
export const POPUP_PLACEMENT_LABEL: Record<PopupPlacement, string> = {
  ALL: "Every page",
  APP: "App pages (dashboard, tasks, wallet …)",
  SITE: "Website pages (home, blog, about …)",
  PATHS: "Only these pages",
};
export const POPUP_SESSION_LABEL: Record<PopupSessionAudience, string> = {
  ANY: "Everyone",
  SIGNED_IN: "Signed-in users only",
  VISITORS: "Visitors (not signed in) only",
};
export const POPUP_FREQUENCY_LABEL: Record<PopupFrequency, string> = {
  ONCE: "Once per person",
  DAILY: "Once a day",
  SESSION: "Once per visit",
  ALWAYS: "On every page load",
};

export type PopupVideo =
  | { kind: "embed"; src: string }
  | { kind: "file"; src: string; mime: string };

/** What the browser receives for one popup: display fields only. */
export interface PopupView {
  id: string;
  title: string;
  kind: PopupKind;
  /** Already sanitised HTML. */
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  cta2Label: string | null;
  cta2Url: string | null;
  /** VIDEO: each link already resolved to what the player needs. */
  videos: PopupVideo[];
  /** HTML: the admin's code, rendered in a sandboxed iframe. */
  htmlCode: string | null;
  htmlHeight: number;
  size: PopupSize;
  frequency: PopupFrequency;
  delaySeconds: number;
  /** Changes when the popup is edited, so an edited popup counts as new. */
  version: string;
}

const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  (list as readonly string[]).includes(String(v)) ? (v as T) : def;

export const sanitizePopupKind = (v: unknown) => pick(v, POPUP_KINDS, "NOTICE");
export const sanitizePopupPlacement = (v: unknown) => pick(v, POPUP_PLACEMENTS, "ALL");
export const sanitizePopupSession = (v: unknown) => pick(v, POPUP_SESSION_AUDIENCES, "ANY");
export const sanitizePopupFrequency = (v: unknown) => pick(v, POPUP_FREQUENCIES, "ONCE");
export const sanitizePopupSize = (v: unknown) => pick(v, POPUP_SIZES, "MEDIUM");
export const sanitizePopupPlanAudience = (v: unknown) => pick(v, POPUP_PLAN_AUDIENCES, "ANY");
export function sanitizePopupDevices(v: unknown): PopupDevice[] {
  const list = Array.isArray(v) ? v : [];
  return [...new Set(list.filter((d): d is PopupDevice => (POPUP_DEVICES as readonly string[]).includes(String(d))))];
}

/** "/wallet, /social\n/tasks" → ["/wallet", "/social", "/tasks"]. */
export function sanitizePopupPaths(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[\n,]/);
  return [
    ...new Set(
      raw
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "") || "/")
        .filter((p) => p.length <= 200)
    ),
  ].slice(0, 50);
}

/**
 * Pages a popup never covers: the admin panel, sign-in flows, and the task
 * runners — a popup over a task in progress costs the user the task.
 */
export function isPopupQuietPath(path: string): boolean {
  return (
    /^\/(admin|login|register|forgot-password|reset-password|verify-email|welcome|appeal|embed)(\/|$)/.test(path) ||
    /^\/(tasks|article-tasks|video-tasks|social-tasks|quiz-tasks|survey-tasks|app-install-tasks|custom-tasks|proxy-tasks|quizzes|games)\/[^/]+/.test(path)
  );
}

/** The public website (marketing and legal pages); everything else is the app. */
const SITE_PREFIXES = [
  "/about", "/features", "/careers", "/blog", "/press", "/help", "/contact",
  "/status", "/microtask", "/advertise", "/referral", "/privacy", "/terms",
  "/refund", "/cookies", "/offer", "/post",
];
export function isSitePath(path: string): boolean {
  return path === "/" || SITE_PREFIXES.some((pre) => path === pre || path.startsWith(`${pre}/`));
}

/** Does this popup's placement cover `path`? */
export function popupPlacementMatches(
  p: { placement: string; paths: string[] },
  path: string
): boolean {
  const placement = sanitizePopupPlacement(p.placement);
  if (placement === "ALL") return true;
  if (placement === "APP") return !isSitePath(path);
  if (placement === "SITE") return isSitePath(path);
  return p.paths.some((pre) => pre === "/" ? path === "/" : path === pre || path.startsWith(`${pre}/`));
}

export function popupSessionMatches(v: string, signedIn: boolean): boolean {
  const s = sanitizePopupSession(v);
  if (s === "SIGNED_IN") return signedIn;
  if (s === "VISITORS") return !signedIn;
  return true;
}
