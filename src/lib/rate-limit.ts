import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * **Know what this is and isn't.** The buckets live in a module-scope Map, so on
 * Vercel each serverless instance has its own — and Vercel scales out under
 * exactly the load an attacker generates, which means the effective limit is
 * `limit × instances` and the attacker controls the instance count. It is a
 * speed bump against casual brute force, not a defence against a determined one.
 *
 * For anything where money moves, use `enforceDbRateLimit` in
 * `src/lib/rate-limit-db.ts` instead — that one is shared across instances.
 * For broad per-IP protection, the Vercel Firewall absorbs traffic before it
 * ever reaches a function (see docs/RATE-LIMITING.md).
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

/**
 * Client IP, taken from the hop we can actually trust.
 *
 * `x-forwarded-for` is a client-supplied list that each proxy APPENDS to, so the
 * LEFTMOST entry is whatever the caller typed — reading it (as this used to)
 * meant an attacker could defeat every IP limiter in the app by sending a random
 * `X-Forwarded-For` per request. The trustworthy value is the one our own edge
 * wrote: `x-vercel-forwarded-for`, or failing that the RIGHTMOST entry of XFF,
 * which is the address the last proxy actually saw.
 */
export function clientIp(req: NextRequest): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return "unknown";
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
