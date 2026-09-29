import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Serve tokens — proof that WE delivered this ad to this viewer.
 *
 * A click used to be billable on nothing more than an ad id and a session: any
 * logged-in account could POST `kind:"open"` for any ad id once a minute and
 * drain a rival campaign's budget without ever having been shown the ad
 * (banner slots never send a view, so there was not even a view to check).
 *
 * Every serve path now stamps each delivered ad with a short-lived HMAC token
 * binding (ad, viewer, issued-at, nonce). `recordClick` bills only when the
 * click presents a valid, unexpired token for the same ad and the same user,
 * and each token bills at most once (its nonce is claimed in `AdEngagement`).
 * Clicks without one still navigate — they are simply not billed.
 *
 * Signed rather than stored: no row per serve on the hot path.
 */

const TTL_MS = 30 * 60_000;

interface Payload {
  /** Ad id. */
  a: string;
  /** Viewer user id. */
  u: string;
  /** Issued-at, epoch ms. */
  t: number;
  /** Nonce — what "at most once per token" is keyed on. */
  n: string;
}

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function mac(body: string, key: string): Buffer {
  // Domain-separated so this key can never validate another token type.
  return createHmac("sha256", key).update(`ad-serve:${body}`).digest();
}

/** Sign a serve token. Returns undefined when there is no viewer or no secret. */
export function signAdServeToken(adId: string, userId: string | null | undefined): string | undefined {
  const key = secret();
  if (!key || !userId) return undefined;
  const p: Payload = { a: adId, u: userId, t: Date.now(), n: randomBytes(9).toString("base64url") };
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return `${body}.${mac(body, key).toString("base64url")}`;
}

/**
 * Verify a serve token for (adId, userId). Returns its nonce when valid, else
 * null. Never throws.
 */
export function verifyAdServeToken(
  token: unknown,
  adId: string,
  userId: string
): { nonce: string } | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 512) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const expected = mac(body, key);
    const provided = Buffer.from(sig, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Payload>;
    if (p.a !== adId || p.u !== userId || typeof p.n !== "string" || typeof p.t !== "number") return null;
    const age = Date.now() - p.t;
    if (age < -60_000 || age > TTL_MS) return null;
    return { nonce: p.n };
  } catch {
    return null;
  }
}
