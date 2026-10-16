import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSetting } from "@/lib/system-settings";

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

/** "https://games.example.com/" → "https://games.example.com"; anything else → null. */
export function normalizeOrigin(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.trim());
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
