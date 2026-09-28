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

export const POPUP_KINDS = ["NOTICE", "IMAGE", "AD"] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

export const POPUP_PLACEMENTS = ["ALL", "APP", "SITE", "PATHS"] as const;
export type PopupPlacement = (typeof POPUP_PLACEMENTS)[number];

export const POPUP_SESSION_AUDIENCES = ["ANY", "SIGNED_IN", "VISITORS"] as const;
export type PopupSessionAudience = (typeof POPUP_SESSION_AUDIENCES)[number];

export const POPUP_FREQUENCIES = ["ONCE", "DAILY", "SESSION", "ALWAYS"] as const;
export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number];

export const POPUP_KIND_LABEL: Record<PopupKind, string> = {
  NOTICE: "Notice",
  IMAGE: "Image",
  AD: "Ad",
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
