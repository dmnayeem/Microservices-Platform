import { prisma } from "@/lib/prisma";

// Per-key in-memory cache. `getSetting` is read on the hottest paths (every
// ad-serve reads cpc + rotation; feed/splash read several) — without this it was
// a DB round-trip per call. Cleared on any settings write via
// `invalidateSettingsCache()`. Short TTL bounds staleness across instances.
const SETTINGS_TTL_MS = 45_000;
const _settingsCache = new Map<string, { value: unknown; at: number }>();

/** Clear the getSetting cache — call after any SystemSetting upsert/delete. */
export function invalidateSettingsCache(): void {
  _settingsCache.clear();
}

/**
 * Read a SystemSetting JSON value by key, falling back to `fallback` when the
 * row is missing or the DB is unreachable. Centralises the findUnique+cast
 * pattern used across the app for admin-configurable settings. Cached (~45s).
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = _settingsCache.get(key);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) {
    return (hit.value ?? fallback) as T;
  }
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key },
      // Accelerate edge cache complements the in-memory map for cold instances.
      cacheStrategy: { ttl: 45, swr: 90 },
    });
    const value =
      row?.value === undefined || row?.value === null ? null : row.value;
    _settingsCache.set(key, { value, at: Date.now() });
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Resolve a secret/config value: prefer the env var, then a SystemSetting row
 * (under `category`, key === the env name lowercased is NOT assumed — pass the
 * exact settings key). Returns "" when neither is set.
 */
export async function getSecret(
  envName: string,
  settingKey: string
): Promise<string> {
  const env = process.env[envName];
  if (env) return env;
  const v = await getSetting<string>(settingKey, "");
  return typeof v === "string" ? v : "";
}
