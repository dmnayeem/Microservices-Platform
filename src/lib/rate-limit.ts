import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory sliding-window rate limiter. Not distributed (per
 * serverless instance), but a meaningful first defense against brute-force on
 * unauthenticated endpoints (login, register, password reset, OTP) where none
 * existed. Upgrade to Upstash/Redis when those env vars are configured.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Convenience guard: returns a 429 response when over the limit, else null.
 * Usage: `const limited = enforceRateLimit(req, "login", 10, 60_000); if (limited) return limited;`
 */
export function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const { ok, retryAfterSec } = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: `Too many attempts. Try again in ${retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
