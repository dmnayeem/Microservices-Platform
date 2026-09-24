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
 * Put a freshly written value straight into the cache.
 *
 * Clearing is not enough on its own. The read below also carries an Accelerate
 * `cacheStrategy`, and that edge cache is not ours to clear — after a write it
 * keeps serving the old row for up to its TTL. So an admin saves a setting,
 * reloads, sees the old value, and saves again.
 *
 * Priming closes that on the instance that did the write, which is the one the
 * admin is talking to. Other instances still wait out the edge TTL, which is
 * the ordinary staleness this cache was chosen for; what they must not do is
 * disagree with the admin who just pressed Save.
 */
export function primeSetting(key: string, value: unknown): void {
  _settingsCache.set(key, { value, at: Date.now() });
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
 * Write a setting and make the new value readable immediately.
 *
 * Use this instead of a bare `systemSetting.upsert`. Doing the upsert by hand
 * is how a settings control ends up looking dead: the admin saves, the page
 * reloads, and `getSetting` hands back the old value — or, the very first time
 * a key is written, the cached ABSENCE of the row, which reads as the fallback
 * and looks exactly like the save having done nothing.
 *
 * Clearing the in-memory map alone does not fix that, because the read above
 * also carries an Accelerate `cacheStrategy` and that edge cache is not ours to
 * clear. Priming closes it on the instance the admin is actually talking to;
 * other instances wait out the ordinary TTL, which is the staleness this cache
 * was chosen for in the first place.
 */
export async function saveSetting(
  key: string,
  value: unknown,
  category: string
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, category, value: value as object },
    update: { category, value: value as object },
  });
  invalidateSettingsCache();
  primeSetting(key, value);
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

/**
 * The platform's display name — admin **General settings → Platform Name**,
 * falling back to `NEXT_PUBLIC_APP_NAME`.
 *
 * That settings box wrote a row nothing read. It now names the sender on
 * outgoing email and the issuer in authenticator apps. The `<title>`/OpenGraph
 * metadata in `app/layout.tsx` is still a hardcoded literal, because changing
 * it is a rebrand (canonical URLs, social cards, the PWA manifest), not a
 * settings toggle.
 */
export async function getPlatformName(): Promise<string> {
  const v = await getSetting<string>("platform_name", "");
  const s = typeof v === "string" ? v.trim() : "";
  return s || process.env.NEXT_PUBLIC_APP_NAME || "EarnGPT";
}
