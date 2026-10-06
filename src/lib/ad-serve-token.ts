import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Serve tokens — proof that WE delivered this ad to this viewer.
 *
 * Every serve path stamps each delivered ad with a short-lived HMAC token
 * binding (ad, placement, network, viewer, issued-at, nonce). Nothing about an
 * ad is counted or billed without one any more:
 *
 *  - a viewable impression is the browser returning the token in a beacon
 *    after the ad was really on screen (src/lib/ad-measure.ts);
 *  - a click is the browser navigating through `/api/spaces/go?st=…`, which
 *    validates the token before redirecting to the ad's stored destination.
 *
 * The nonce is what "one count per delivery" is keyed on (`AdEvent` unique
 * (nonce, kind)), so a token can never be counted — or billed — twice.
 *
 * Signed rather than stored: no row per serve on the hot path.
 *
 * Viewer binding:
 *  - signed in → `u:<userId>`
 *  - anonymous → `a:<hash(user-agent)>`. Deliberately NOT the IP: mobile
 *    carriers (and the owner) change IP mid-session, and a real viewer whose IP
 *    moved between serve and beacon must not be filtered as fraud.
 */

/** View beacons older than this are "expired". */
export const VIEW_TOKEN_TTL_MS = 30 * 60_000;
/** Clicks may come later than views — a tab left open, then clicked. */
export const CLICK_TOKEN_TTL_MS = 2 * 60 * 60_000;

export interface AdServeTokenPayload {
  /** Ad id. */
  a: string;
  /** Placement (space) name. */
  p: string;
  /** Network label (adsense | gam | registry id | own | custom). */
  k: string;
  /** Viewer key — `u:<id>` or `a:<uaHash>`. */
  v: string;
  /** Issued-at, epoch ms. */
  t: number;
  /** Nonce. */
  n: string;
}

function secret(): string | null {
  return (
    process.env.AD_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  );
}

function mac(body: string, key: string): Buffer {
  // Domain-separated so this key can never validate another token type. "v2"
  // so a token minted by the old (ad, user)-only format never verifies.
  return createHmac("sha256", key).update(`ad-serve:v2:${body}`).digest();
}

export function shortHash(s: string, len = 24): string {
  return createHash("sha256").update(s).digest("hex").slice(0, len);
}

/** The viewer key a token binds to. */
export function adViewerKey(userId: string | null | undefined, userAgent: string | null | undefined): string {
  return userId ? `u:${userId}` : `a:${shortHash(userAgent ?? "", 16)}`;
}

/** Sign a serve token. Returns undefined only when no secret is configured. */
export function signAdServeToken(input: {
  adId: string;
  placement: string;
  network: string;
  viewerKey: string;
}): string | undefined {
  const key = secret();
  if (!key) return undefined;
  const p: AdServeTokenPayload = {
    a: input.adId,
    p: input.placement.slice(0, 64),
    k: input.network.slice(0, 40),
    v: input.viewerKey,
    t: Date.now(),
    n: randomBytes(12).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return `${body}.${mac(body, key).toString("base64url")}`;
}

export type TokenCheck =
  | { ok: true; payload: AdServeTokenPayload }
  | { ok: false; reason: "no_token" | "bad_token" };

/**
 * Verify the signature and decode. Age and viewer are judged by the caller
 * (src/lib/ad-ivt.ts), so that an expired or mismatched token is RECORDED as
 * invalid traffic against the right ad instead of vanishing. Never throws.
 */
export function decodeAdServeToken(token: unknown): TokenCheck {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "no_token" };
  const key = secret();
  if (!key || token.length > 1024) return { ok: false, reason: "bad_token" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "bad_token" };
  try {
    const expected = mac(body, key);
    const provided = Buffer.from(sig, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { ok: false, reason: "bad_token" };
    }
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AdServeTokenPayload>;
    if (
      typeof p.a !== "string" ||
      typeof p.p !== "string" ||
      typeof p.k !== "string" ||
      typeof p.v !== "string" ||
      typeof p.n !== "string" ||
      typeof p.t !== "number"
    ) {
      return { ok: false, reason: "bad_token" };
    }
    return { ok: true, payload: p as AdServeTokenPayload };
  } catch {
    return { ok: false, reason: "bad_token" };
  }
}
