/**
 * Bounds for the global game-earning guardrails (`games.*` settings).
 *
 * Prisma-free so the admin form can import it. `getGamesGlobalConfig()` clamps
 * to these on read; the admin save route REJECTS anything outside them, so an
 * admin is told about a typo instead of having it silently clamped.
 */
export const GAMES_BOUNDS = {
  maxPointsPerTick: { min: 0, max: 1_000 },
  minTickSeconds: { min: 5, max: 3_600 },
  globalDailyCap: { min: 0, max: 100_000 },
  maxPerSession: { min: 0, max: 100_000 },
} as const;
