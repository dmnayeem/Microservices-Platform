import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { rateLimit } from "@/lib/rate-limit";
import { requireActiveUser } from "@/lib/require-active";
import { getPointsPerUsd } from "@/lib/economy";
import { startSession, heartbeat, reportScore, BEAT_INTERVAL_SECONDS } from "@/lib/game-session";
import {
  absoluteAvatar,
  gameCors,
  gamePreflight,
  isAllowedGameOrigin,
  normalizeOrigin,
  playerKeyFor,
  verifyGameConnectToken,
} from "@/lib/game-connect";

/**
 * /api/games/ext/:action — the owner's separate game website, via the RevType
 * Games SDK in standalone mode (see src/lib/game-connect.ts).
 *
 *   GET  me         → the connected member's name and Earn Points
 *   POST session    { gameId }                    → open a play session
 *   POST heartbeat  { gameId, sessionId, scoreTotal?, final? } → play time + score
 *   POST score      { gameId, sessionId, total }  → running score (SDK v2.0 only)
 *
 * Cookie-less (public in middleware): every call carries the connect token as
 * `Authorization: Bearer …`, must come from an allowed game website, and the
 * token must have been issued for that same website. All money rules are the
 * shared game-session ones — play time is measured here, not by the game.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com").replace(/\/+$/, "");

export async function OPTIONS(req: NextRequest) {
  const origin = normalizeOrigin(req.headers.get("origin"));
  return gamePreflight(origin && (await isAllowedGameOrigin(origin)) ? origin : null);
}

/**
 * `checkStatus` costs a query, so it runs where a session starts and on `me`;
 * a beat's payout re-checks the account under its own lock instead.
 */
async function authorize(req: NextRequest, checkStatus = true) {
  const origin = normalizeOrigin(req.headers.get("origin"));
  if (!origin || !(await isAllowedGameOrigin(origin))) {
    return { error: gameCors(null, { error: "This website is not allowed to use RevType." }, { status: 403 }) };
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const p = verifyGameConnectToken(token);
  if (!p || p.o !== origin) {
    return { error: gameCors(origin, { error: "Please connect your RevType account again.", reason: "token" }, { status: 401 }) };
  }
  if (checkStatus) {
    const active = await requireActiveUser(p.u);
    if (!active.ok) {
      return { error: gameCors(origin, { error: active.message }, { status: active.httpStatus }) };
    }
  }
  return { origin, userId: p.u };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const a = await authorize(req);
  if ("error" in a) return a.error;
  if (action !== "me") return gameCors(a.origin, { error: "Not found" }, { status: 404 });

  const [user, ppu] = await Promise.all([
    prisma.user.findUnique({ where: { id: a.userId }, select: { name: true, username: true, avatar: true, pointsBalance: true } }),
    getPointsPerUsd(),
  ]);
  if (!user) return gameCors(a.origin, { error: "Account not found", reason: "token" }, { status: 401 });
  return gameCors(a.origin, {
    name: user.name || user.username || "RevType member",
    // The member's RevType picture, so the game can use it as the profile photo.
    avatar: absoluteAvatar(user.avatar),
    points: user.pointsBalance,
    usd: ppu > 0 ? Math.floor((user.pointsBalance / ppu) * 100) / 100 : 0,
    withdrawUrl: `${SITE_URL}/withdrawal`,
    // For games whose SERVER decides income: the game stores this with its
    // own account and uses it in /api/games/s2s/credit.
    playerKey: playerKeyFor(a.userId, a.origin),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const a = await authorize(req, action === "session");
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as {
    gameId?: string;
    sessionId?: string;
    total?: number;
    scoreTotal?: number;
    final?: boolean;
  };
  if (!body.gameId) return gameCors(a.origin, { error: "gameId required" }, { status: 400 });

  if (action === "session") {
    const limited = await enforceDbRateLimit(req, "game-ext-session", a.userId, 20, 60_000);
    if (limited) return gameCors(a.origin, { error: "Too many requests" }, { status: 429 });
    const s = await startSession(a.userId, body.gameId);
    if (!s) return gameCors(a.origin, { error: "This game is not available on RevType." }, { status: 404 });
    return gameCors(a.origin, { sessionId: s.sessionId, reward: s.reward, score: s.score, beatSeconds: BEAT_INTERVAL_SECONDS });
  }

  if (!body.sessionId) return gameCors(a.origin, { error: "sessionId required" }, { status: 400 });

  if (action === "heartbeat") {
    // In memory: see /api/games/[id]/heartbeat — money never depends on it.
    if (!rateLimit(`game-beat:${a.userId}`, 20, 60_000).ok) {
      return gameCors(a.origin, { error: "Too many requests" }, { status: 429 });
    }
    const out = await heartbeat(a.userId, body.gameId, body.sessionId, {
      loaded: true,
      scoreTotal: typeof body.scoreTotal === "number" ? body.scoreTotal : undefined,
      final: body.final === true,
    });
    if (!out.ok) return gameCors(a.origin, { error: "This play session is no longer open.", reason: out.reason }, { status: 409 });
    return gameCors(a.origin, out.result);
  }

  if (action === "score") {
    const total = Number(body.total);
    if (!Number.isFinite(total) || total < 0) return gameCors(a.origin, { error: "total required" }, { status: 400 });
    if (!rateLimit(`game-score:${a.userId}`, 20, 60_000).ok) {
      return gameCors(a.origin, { error: "Too many requests" }, { status: 429 });
    }
    const out = await reportScore(a.userId, body.gameId, body.sessionId, total);
    if (!out.ok) {
      return gameCors(
        a.origin,
        { error: out.reason === "off" ? "This game does not pay for scores." : "This play session is no longer open.", reason: out.reason },
        { status: out.reason === "off" ? 403 : 409 }
      );
    }
    return gameCors(a.origin, out.result);
  }

  return gameCors(a.origin, { error: "Not found" }, { status: 404 });
}
