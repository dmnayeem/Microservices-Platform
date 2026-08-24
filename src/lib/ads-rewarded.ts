import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { getSetting } from "@/lib/system-settings";

/**
 * Rewarded video ads — config and watch proof.
 *
 * ## Shipped OFF
 *
 * `ads.rewarded_enabled` defaults to **false**, and both routes refuse while it
 * is. That is deliberate, not caution: a rewarded ad **pays points out**. Filled
 * with house inventory — which is all this platform has today — every watch is a
 * cost to the owner and earns him nothing. The feature is complete and waiting
 * for inventory that actually pays (offerwall/CPA, or a CPM advertiser); until
 * then the switch stays off.
 *
 * ## Watch proof
 *
 * `Ad.watchSeconds` was never enforced. A bare `POST /api/ads/{id}/reward` with
 * no body credited points immediately — nothing recorded that a video had played,
 * or that any time had passed. Combined with the absent daily cap (see
 * `ad-billing.ts:8-10`, which already flags it), the route paid out on demand.
 *
 * The GET now issues a signed token when it serves an ad, and the POST requires
 * one. **Stated plainly: this proves that `watchSeconds` elapsed between the ad
 * being served and the reward being claimed. It does not prove a video played.**
 * A determined user can request, wait, and claim. What it does close is the
 * "POST in a loop and farm points" hole that exists today, and it costs the
 * attacker real time per reward, which combined with the cooldown and the daily
 * cap bounds the damage to something small and bounded.
 *
 * The honest upgrade, if this is ever switched on with real money behind it, is
 * a per-second server-authoritative heartbeat — the pattern `video-task-player`
 * already uses for video TASKS, where seconds are accrued from `currentTime`
 * deltas and verified server-side.
 *
 * The token id doubles as the **idempotency key**: the reward ledger row is keyed
 * on it, so replaying one token credits once. Before this the reference embedded
 * `Date.now()`, which defeated the `@@unique([userId, reference])` backstop
 * entirely.
 */

export interface RewardedConfig {
  /** Master switch. Default FALSE — see above. */
  enabled: boolean;
  /** Max points one user may earn from rewarded ads per local day. */
  dailyCap: number;
}

const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export async function getRewardedConfig(): Promise<RewardedConfig> {
  const [enabled, cap] = await Promise.all([
    getSetting<boolean>("ads.rewarded_enabled", false),
    getSetting<number>("ads.rewarded_daily_cap", 50),
  ]);
  return {
    // Anything other than an explicit `true` is off. A malformed setting must
    // fail closed for a feature that spends the owner's money.
    enabled: enabled === true,
    dailyCap: clampInt(cap, 50, 0, 100000),
  };
}

/** A token is useless after this long, so a stockpile cannot be built up. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s =
    process.env.ARTICLE_TASK_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing token secret for rewarded ads");
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export interface WatchToken {
  /** Unique per issue — the idempotency key for the credit. */
  id: string;
  userId: string;
  adId: string;
  issuedAt: number;
}

/** Issue a watch token for one (user, ad) pair, at the moment the ad is served. */
export function signWatchToken(userId: string, adId: string): string {
  const body = b64url(
    Buffer.from(`${randomUUID()}.${userId}.${adId}.${Date.now()}`, "utf8")
  );
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verify a watch token. Returns the payload, or null when it is forged, expired,
 * malformed, or issued for a different user or ad.
 *
 * The user and ad are checked HERE rather than by the caller, because forgetting
 * either check is the whole attack: a token issued for a cheap ad would otherwise
 * redeem an expensive one, and one user's token would redeem for another.
 */
export function verifyWatchToken(
  token: string | null | undefined,
  expectUserId: string,
  expectAdId: string
): WatchToken | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", secret()).update(body).digest();
    provided = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
  } catch {
    return null;
  }
  const [id, userId, adId, issued] = decoded.split(".");
  const issuedAt = Number(issued);
  if (!id || !userId || !adId || !Number.isFinite(issuedAt)) return null;
  if (userId !== expectUserId || adId !== expectAdId) return null;
  if (Date.now() - issuedAt > TOKEN_TTL_MS) return null;
  // A clock-skewed or hand-crafted future timestamp would make the elapsed check
  // below trivially satisfiable, so reject it outright.
  if (issuedAt > Date.now() + 60_000) return null;

  return { id, userId, adId, issuedAt };
}

/** Seconds elapsed since the ad was served — the enforced part of `watchSeconds`. */
export function watchedSeconds(token: WatchToken): number {
  return Math.max(0, Math.floor((Date.now() - token.issuedAt) / 1000));
}

/** The ledger reference for a rewarded credit. Deterministic, so a replay is a no-op. */
export function rewardReference(token: WatchToken): string {
  return `adreward_${token.id}`;
}
