import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSetting, saveSetting } from "@/lib/system-settings";

/**
 * "Connect RevType" for the owner's separate game website (owner, 2026-10-17).
 *
 * Games run on their own site, not inside RevType. A player there presses
 * "Connect RevType" (the SDK, public/sdk/revtype-games.js), signs in on
 * revtype.com in a popup (/connect/games), and allows that site. RevType hands
 * the SDK a signed token naming the member; the SDK then calls
 * /api/games/ext/* with it — no cookies cross sites. Points land in the
 * member's Earn Points and are withdrawn on revtype.com as usual.
 *
 * Only sites the admin lists under Games → Settings → "Game websites" may ask
 * for a token or call the API, and the token is bound to the site it was
 * issued for. Play time and score limits are enforced by the same
 * startSession / heartbeat / reportScore code as games played inside RevType.
 */

export const GAME_CONNECT_ORIGINS_KEY = "games.connect_origins";

/** Long enough that players are not asked again every visit. */
const TTL_SECONDS = 60 * 60 * 24 * 30;

interface Payload {
  /** Token type — keeps this token from ever verifying as another kind. */
  typ: "game-connect";
  /** Member id. */
  u: string;
  /** The game website it was issued for. */
  o: string;
  iat: number;
  exp: number;
}

function secret(): string {
  const s = process.env.GAME_CONNECT_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing token secret (GAME_CONNECT_SECRET, NEXTAUTH_SECRET or AUTH_SECRET)");
  return s;
}

const b64 = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b, "utf8") : b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const unb64 = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4), "base64");

// Domain-separated from the other HMAC tokens that share the auth secret.
const sign = (body: string) => b64(createHmac("sha256", secret()).update(`game-connect.${body}`).digest());

export function signGameConnectToken(userId: string, origin: string): string {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ typ: "game-connect", u: userId, o: origin, iat: now, exp: now + TTL_SECONDS } satisfies Payload));
  return `${body}.${sign(body)}`;
}

export function verifyGameConnectToken(token: string | null | undefined): Payload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(unb64(body).toString("utf8")) as Payload;
    if (p.typ !== "game-connect" || !p.u || !p.o) return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * "https://games.example.com/play/x" → "https://games.example.com". A bare
 * "games.example.com" (typed without https://) is read as https. Anything
 * that is not https (except localhost) → null.
 */
export function normalizeOrigin(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** The game websites the admin allowed (Games → Settings). */
export async function getGameConnectOrigins(): Promise<string[]> {
  const raw = await getSetting<unknown>(GAME_CONNECT_ORIGINS_KEY, []).catch(() => []);
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  return [...new Set(list.map((x) => normalizeOrigin(String(x))).filter((x): x is string => !!x))];
}

export async function isAllowedGameOrigin(origin: string | null | undefined): Promise<boolean> {
  const o = normalizeOrigin(origin);
  return !!o && (await getGameConnectOrigins()).includes(o);
}

/** JSON response with CORS for one allowed game website. */
export function gameCors<T>(origin: string | null, body: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init);
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function gamePreflight(origin: string | null): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

// ── Game server → RevType (server to server) ─────────────────────────────────
//
// When the owner's game server decides what a player earned (owner,
// 2026-10-17), it reports it straight to RevType: POST /api/games/s2s/credit,
// signed with that website's SERVER KEY. The browser is never trusted with
// money. A player is named by their PLAYER KEY — a permanent, site-bound id the
// game gets once the player presses "Connect RevType" (SDK: RevType.onReady →
// info.playerKey) and stores with its own account.

export const GAME_SITE_KEY_VERSIONS = "games.connect_key_versions";

/** Short, stable id of a website — part of ledger references. */
export function siteId(origin: string): string {
  return createHmac("sha256", "game-site-id").update(origin).digest("hex").slice(0, 10);
}

async function keyVersions(): Promise<Record<string, number>> {
  const raw = await getSetting<unknown>(GAME_SITE_KEY_VERSIONS, {}).catch(() => ({}));
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, number>) : {};
}

/**
 * The website's server key. Derived (nothing secret is stored): rotating it
 * bumps the version, which changes the key and kills the old one at once.
 */
export async function getSiteServerKey(origin: string): Promise<string> {
  const v = Number((await keyVersions())[origin] ?? 1) || 1;
  return `rtgs_${createHmac("sha256", secret()).update(`game-site-key.${origin}.${v}`).digest("hex").slice(0, 48)}`;
}

export async function rotateSiteServerKey(origin: string): Promise<void> {
  const all = await keyVersions();
  all[origin] = (Number(all[origin] ?? 1) || 1) + 1;
  await saveSetting(GAME_SITE_KEY_VERSIONS, all, "games");
}

/** Constant-time check of a request body's signature against the site's key. */
export async function verifySiteSignature(origin: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await getSiteServerKey(origin);
  const want = Buffer.from(createHmac("sha256", key).update(rawBody).digest("hex"));
  const got = Buffer.from(signature.trim().toLowerCase());
  return want.length === got.length && timingSafeEqual(want, got);
}

const signPlayer = (body: string) => b64(createHmac("sha256", secret()).update(`game-player.${body}`).digest());

/** Permanent player id for one website. Only usable with that site's server key. */
export function playerKeyFor(userId: string, origin: string): string {
  const body = b64(JSON.stringify({ typ: "game-player", u: userId, o: origin }));
  return `rtp_${body}.${signPlayer(body)}`;
}

export function verifyPlayerKey(key: string | null | undefined): { userId: string; origin: string } | null {
  if (!key || !key.startsWith("rtp_")) return null;
  const [body, sig] = key.slice(4).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(signPlayer(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(unb64(body).toString("utf8")) as { typ?: string; u?: string; o?: string };
    return p.typ === "game-player" && p.u && p.o ? { userId: p.u, origin: p.o } : null;
  } catch {
    return null;
  }
}

// ── One-time login token ("RevType secure sign-in") ─────────────────────────
//
// A game website may let a player SIGN IN with RevType (GamesYap, 2026-10-24).
// The permanent playerKey must not be the login credential, so the SDK asks for
// a short-lived, single-use login token (/api/games/ext/login-token) and the
// game's server trades it once for the player at /api/games/s2s/login, signed
// with that website's server key. Bound to the site it was issued for.

/** How long a login token can be traded (seconds). */
export const GAME_LOGIN_TTL_SECONDS = 5 * 60;

interface LoginPayload {
  typ: "game-login";
  u: string;
  o: string;
  /** Random id: the token is claimed once by this id. */
  j: string;
  iat: number;
  exp: number;
}

const signLogin = (body: string) => b64(createHmac("sha256", secret()).update(`game-login.${body}`).digest());

export function signGameLoginToken(userId: string, origin: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: LoginPayload = { typ: "game-login", u: userId, o: origin, j: randomBytes(16).toString("hex"), iat: now, exp: now + GAME_LOGIN_TTL_SECONDS };
  const body = b64(JSON.stringify(payload));
  return `rtl_${body}.${signLogin(body)}`;
}

export function verifyGameLoginToken(token: string | null | undefined): LoginPayload | null {
  if (!token || !token.startsWith("rtl_") || token.length > 2048) return null;
  const [body, sig] = token.slice(4).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(signLogin(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(unb64(body).toString("utf8")) as LoginPayload;
    if (p.typ !== "game-login" || !p.u || !p.o || !/^[0-9a-f]{32}$/.test(p.j)) return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * A member's picture as a full URL a game on another website can load:
 * absolute URLs (Google, S3) as they are, site paths ("/api/media/...")
 * prefixed with the RevType address. Anything else → "".
 */
export function absoluteAvatar(avatar: string | null | undefined): string {
  const a = (avatar ?? "").trim();
  if (/^https?:\/\//i.test(a)) return a;
  if (a.startsWith("/")) {
    return `${(process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com").replace(/\/+$/, "")}${a}`;
  }
  return "";
}
