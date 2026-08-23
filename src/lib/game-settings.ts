import "server-only";
import { getSetting } from "@/lib/system-settings";

/**
 * Global guardrails for game earning.
 *
 * Per-game values are set by whoever adds the game; these are the ceilings that
 * every one of them is clamped against, so a mistyped `rewardPointsPerTick` on
 * one game cannot drain the treasury. Same shape and reasoning as
 * `getBrowseEarnConfig` in src/lib/browse-earn.ts.
 *
 * Stored under the `games.*` SystemSetting category. That category needs no
 * registration anywhere — `POST /api/admin/settings` accepts any category
 * string, exactly as `ads.*` does.
 */

export interface GamesGlobalConfig {
  /** Master kill switch for ALL game earning. */
  enabled: boolean;
  /** Ceiling on any single game's points-per-tick. */
  maxPointsPerTick: number;
  /** Floor on any single game's tick length — the real rate limiter. */
  minTickSeconds: number;
  /** Points one user may earn per LOCAL day across every game combined. */
  globalDailyCap: number;
  /** Points one user may earn per session, whatever the game says. */
  maxPerSession: number;
}

export const GAMES_DEFAULTS: GamesGlobalConfig = {
  enabled: true,
  maxPointsPerTick: 10,
  minTickSeconds: 30,
  globalDailyCap: 200,
  maxPerSession: 100,
};

export const GAMES_SETTING_KEYS = {
  enabled: "games.reward_enabled",
  maxPointsPerTick: "games.max_points_per_tick",
  minTickSeconds: "games.min_tick_seconds",
  globalDailyCap: "games.global_daily_cap",
  maxPerSession: "games.max_per_session",
} as const;

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Read the admin-tuned global config, with safe clamped fallbacks. */
export async function getGamesGlobalConfig(): Promise<GamesGlobalConfig> {
  try {
    const [enabled, perTick, tickSecs, dailyCap, perSession] = await Promise.all([
      getSetting<boolean>(GAMES_SETTING_KEYS.enabled, GAMES_DEFAULTS.enabled),
      getSetting<number>(GAMES_SETTING_KEYS.maxPointsPerTick, GAMES_DEFAULTS.maxPointsPerTick),
      getSetting<number>(GAMES_SETTING_KEYS.minTickSeconds, GAMES_DEFAULTS.minTickSeconds),
      getSetting<number>(GAMES_SETTING_KEYS.globalDailyCap, GAMES_DEFAULTS.globalDailyCap),
      getSetting<number>(GAMES_SETTING_KEYS.maxPerSession, GAMES_DEFAULTS.maxPerSession),
    ]);
    return {
      enabled: enabled !== false,
      maxPointsPerTick: clampInt(perTick, 0, 1_000, GAMES_DEFAULTS.maxPointsPerTick),
      minTickSeconds: clampInt(tickSecs, 5, 3_600, GAMES_DEFAULTS.minTickSeconds),
      globalDailyCap: clampInt(dailyCap, 0, 100_000, GAMES_DEFAULTS.globalDailyCap),
      maxPerSession: clampInt(perSession, 0, 100_000, GAMES_DEFAULTS.maxPerSession),
    };
  } catch {
    // Fails soft: a settings blip must not turn earning off mid-session, nor
    // uncap it.
    return { ...GAMES_DEFAULTS };
  }
}

/** The per-game reward fields this resolver reads. */
export interface GameRewardFields {
  rewardEnabled: boolean;
  rewardPointsPerTick: number;
  rewardTickSeconds: number;
  rewardMaxPerSession: number;
  rewardDailyCapPoints: number;
  rewardRequiresAd: boolean;
}

export interface ResolvedGameReward {
  enabled: boolean;
  pointsPerTick: number;
  tickSeconds: number;
  /** 0 = unbounded by the game (the global caps still apply). */
  maxPerSession: number;
  /** Per-game, per-local-day. 0 = unbounded by the game. */
  dailyCap: number;
  requiresAd: boolean;
  /** Across ALL games, per user, per local day. */
  globalDailyCap: number;
}

/**
 * The effective reward rules for one game: its own settings, clamped by the
 * globals. Every clamp is a `Math.min`/`Math.max` rather than a rejection, so a
 * too-generous game quietly pays the allowed maximum instead of silently paying
 * nothing (which is the failure mode an admin never notices).
 */
export function resolveGameReward(
  game: GameRewardFields,
  globals: GamesGlobalConfig
): ResolvedGameReward {
  const enabled = globals.enabled && game.rewardEnabled;
  const pointsPerTick = Math.max(
    0,
    Math.min(game.rewardPointsPerTick, globals.maxPointsPerTick)
  );
  const tickSeconds = Math.max(game.rewardTickSeconds, globals.minTickSeconds);

  // 0 means "no per-game limit", so it must not win a Math.min against the
  // global — it would clamp everything to zero.
  const maxPerSession =
    game.rewardMaxPerSession > 0 && globals.maxPerSession > 0
      ? Math.min(game.rewardMaxPerSession, globals.maxPerSession)
      : game.rewardMaxPerSession || globals.maxPerSession;

  return {
    enabled: enabled && pointsPerTick > 0 && tickSeconds > 0,
    pointsPerTick,
    tickSeconds,
    maxPerSession,
    dailyCap: Math.max(0, game.rewardDailyCapPoints),
    requiresAd: game.rewardRequiresAd,
    globalDailyCap: globals.globalDailyCap,
  };
}

/** Max points/hour a game can pay one user — shown to the admin as they type. */
export function pointsPerHour(r: Pick<ResolvedGameReward, "pointsPerTick" | "tickSeconds">): number {
  if (r.tickSeconds <= 0) return 0;
  return Math.floor((3600 / r.tickSeconds) * r.pointsPerTick);
}
