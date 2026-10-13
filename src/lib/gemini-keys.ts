import "server-only";
import { getSecret, getSetting } from "@/lib/system-settings";

/**
 * Several Gemini keys, used in order (owner, 2026-10-13): the main key
 * (GEMINI_API_KEY env, else Settings → Integrations → Gemini API key), then the
 * backup keys (GEMINI_API_KEYS env, comma-separated, plus the "Backup Gemini
 * keys" box, one per line). A key Google answers "quota used up" or "bad key"
 * for is benched and the SAME request goes straight to the next one; it is
 * tried again when Google said the quota comes back (else after an hour).
 *
 * Note: quota belongs to a Google Cloud PROJECT, not a key — several keys from
 * one project share one quota, so a backup only helps from another project.
 *
 * The bench is per server process: after a restart a used-up key costs one
 * fast 429 before it is benched again.
 */

const BACKUP_KEY = "gemini_api_keys_backup";
const bench = new Map<string, { until: number; reason: string }>();

/** The keys, main first, without duplicates or blanks. */
export async function geminiKeys(): Promise<string[]> {
  const main = await getSecret("GEMINI_API_KEY", "gemini_api_key");
  const envList = (process.env.GEMINI_API_KEYS ?? "").split(/[,\s]+/);
  const saved = await getSetting<string>(BACKUP_KEY, "").catch(() => "");
  const list = [main, ...envList, ...(typeof saved === "string" ? saved.split(/[\s,]+/) : [])]
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export async function hasGeminiKey(): Promise<boolean> {
  return (await geminiKeys()).length > 0;
}

/** "AIza…x9Q2" — enough to tell keys apart, never the key. */
export function maskKey(k: string): string {
  return k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "…";
}

/** How long Google said to wait: RetryInfo "35066s", or "retry in 9h46m37s". */
function waitMs(body: unknown, fallbackMs: number): number {
  const err = (body as { error?: { message?: string; details?: { retryDelay?: string }[] } })?.error;
  for (const d of err?.details ?? []) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d?.retryDelay ?? "");
    if (m) return Math.max(60_000, Number(m[1]) * 1000);
  }
  const m = /retry in\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(err?.message ?? "");
  if (m && (m[1] || m[2] || m[3])) {
    return Math.max(60_000, ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000);
  }
  return fallbackMs;
}

/**
 * POST to a Gemini endpoint (no `?key=`), trying each usable key in turn.
 * Returns the first response that is not "this key can't serve" — or the last
 * failure, so callers keep their own error handling. Throws only when no key
 * is set at all.
 */
export async function geminiFetch(url: string, init: RequestInit): Promise<Response> {
  const keys = await geminiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");
  const now = Date.now();
  const usable = keys.filter((k) => (bench.get(k)?.until ?? 0) <= now);
  // Every key benched: try the one that comes back soonest rather than fail.
  const order = usable.length
    ? usable
    : [...keys].sort((a, b) => (bench.get(a)?.until ?? 0) - (bench.get(b)?.until ?? 0)).slice(0, 1);

  let last: Response | null = null;
  for (const key of order) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}key=${encodeURIComponent(key)}`, init);
    if (res.ok) {
      bench.delete(key);
      return res;
    }
    const body = await res.clone().json().catch(() => ({}));
    const status = (body as { error?: { status?: string } })?.error?.status ?? "";
    const msg = (body as { error?: { message?: string } })?.error?.message ?? "";
    if (res.status === 429 || status === "RESOURCE_EXHAUSTED") {
      bench.set(key, { until: Date.now() + waitMs(body, 3_600_000), reason: "quota used up" });
    } else if (res.status === 403 || status === "PERMISSION_DENIED" || /API key not valid|API_KEY_INVALID/i.test(msg)) {
      bench.set(key, { until: Date.now() + 6 * 3_600_000, reason: "key rejected" });
    } else {
      // A bad request or a Google outage — another key would fail the same way.
      return res;
    }
    last = res;
  }
  return last!;
}

/** For the admin "Test keys" button: each key, and whether it is benched. */
export async function geminiKeyStatus(): Promise<{ key: string; benched: string | null }[]> {
  const now = Date.now();
  return (await geminiKeys()).map((k) => {
    const b = bench.get(k);
    if (!b || b.until <= now) return { key: k, benched: null };
    const mins = Math.ceil((b.until - now) / 60_000);
    return { key: k, benched: `${b.reason} — back in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}` };
  });
}
