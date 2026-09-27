// Splash / onboarding screen config. Pure (no prisma) so it is safe to import
// from client components. Persisted as a SystemSetting row (key below).

export const SPLASH_SETTING_KEY = "splash_config";

export type SplashFrequency = "once" | "session" | "always";

export interface SplashSlide {
  title: string;
  content: string;
  imageUrl: string;
}

export interface SplashConfig {
  enabled: boolean;
  /** Per-slide auto-advance time in ms (admin-adjustable). */
  durationMs: number;
  frequency: SplashFrequency;
  slides: SplashSlide[];
}

export const DEFAULT_SPLASH: SplashConfig = {
  enabled: false,
  durationMs: 3500,
  frequency: "once",
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
        .slice(0, 6)
    : DEFAULT_SPLASH.slides;
  const durationMs = Number(r.durationMs);
  return {
    enabled: !!r.enabled,
    durationMs: Number.isFinite(durationMs) && durationMs >= 500 ? durationMs : DEFAULT_SPLASH.durationMs,
    frequency:
      r.frequency === "session" || r.frequency === "always" ? r.frequency : "once",
    slides,
  };
}
