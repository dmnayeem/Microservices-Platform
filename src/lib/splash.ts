// Splash / onboarding screen config. Pure (no prisma) so it is safe to import
// from client components. Persisted as a SystemSetting row (key below).

import { sanitizeDeviceTarget } from "@/lib/device-target";

export const SPLASH_SETTING_KEY = "splash_config";

/**
 * When it shows (owner, 2026-10-17): only right after a member signs in or
 * registers — once per sign-in, never to visitors and never on ordinary app
 * opens. The sign-in time travels in the session (`session.user.loginAt`);
 * the splash is offered for this long after it.
 */
export const SPLASH_LOGIN_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Browser key holding the sign-in (loginAt) the splash was last shown for. */
export const SPLASH_SEEN_KEY = "splash_login_seen";

/**
 *   slides — image, title and text, with Next / Get started buttons.
 *   images — image only (9:16), full screen, nothing else on screen; tap
 *            for the next image, the last tap closes it. The whole image is
 *            always visible (never cropped), centred on wide screens.
 */
export type SplashMode = "slides" | "images";

/** login = everyone, once per sign-in · new = only accounts created in the last day. */
export type SplashAudience = "login" | "new";

export const SPLASH_MAX_SLIDES = 10;

export interface SplashSlide {
  title: string;
  content: string;
  imageUrl: string;
}

export interface SplashConfig {
  enabled: boolean;
  mode: SplashMode;
  audience: SplashAudience;
  /** Per-slide auto-advance time in ms ("slides" mode only; images advance on tap). */
  durationMs: number;
  slides: SplashSlide[];
  /** Shown only from / until these times (ISO; "" = no limit). */
  startsAt?: string;
  endsAt?: string;
  /** Device targeting (lib/device-target.ts) — checked in the browser. */
  deviceTypes?: string[];
  deviceOses?: string[];
  deviceBrands?: string[];
}

export const DEFAULT_SPLASH: SplashConfig = {
  enabled: false,
  mode: "slides",
  audience: "login",
  durationMs: 3500,
  slides: [
    { title: "Welcome to RevType", content: "Complete tasks and earn real rewards.", imageUrl: "" },
    { title: "Do Tasks, Earn Points", content: "Watch videos, take surveys, engage on social.", imageUrl: "" },
    { title: "Learn & Grow", content: "Take courses and level up your skills.", imageUrl: "" },
    { title: "Invite & Multiply", content: "Refer friends and earn multi-level commissions.", imageUrl: "" },
    { title: "Cash Out", content: "Withdraw your earnings anytime.", imageUrl: "" },
  ],
};

/** Coerce arbitrary stored JSON into a valid SplashConfig, merged over defaults. */
export function normalizeSplashConfig(raw: unknown): SplashConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SPLASH };
  const r = raw as Partial<SplashConfig>;
  const slides = Array.isArray(r.slides)
    ? r.slides
        .filter((s): s is SplashSlide => !!s && typeof s === "object")
        .map((s) => ({
          title: typeof s.title === "string" ? s.title : "",
          content: typeof s.content === "string" ? s.content : "",
          imageUrl: typeof s.imageUrl === "string" ? s.imageUrl : "",
        }))
        .slice(0, SPLASH_MAX_SLIDES)
    : DEFAULT_SPLASH.slides;
  const durationMs = Number(r.durationMs);
  return {
    enabled: !!r.enabled,
    mode: r.mode === "images" ? "images" : "slides",
    audience: r.audience === "new" ? "new" : "login",
    durationMs: Number.isFinite(durationMs) && durationMs >= 500 ? durationMs : DEFAULT_SPLASH.durationMs,
    slides,
    startsAt: isoOrEmpty(r.startsAt),
    endsAt: isoOrEmpty(r.endsAt),
    ...sanitizeDeviceTarget(r),
  };
}

function isoOrEmpty(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Is the splash inside its dates right now? */
export function splashInWindow(c: Pick<SplashConfig, "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return false;
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return false;
  return true;
}
