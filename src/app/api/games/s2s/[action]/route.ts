import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { getUserDayContext } from "@/lib/user-day";
import { getGamesGlobalConfig } from "@/lib/game-settings";
import { TransactionType } from "@/generated/prisma";
import { absoluteAvatar, isAllowedGameOrigin, normalizeOrigin, siteId, verifyPlayerKey, verifySiteSignature } from "@/lib/game-connect";

/**
 * /api/games/s2s/:action — the owner's GAME SERVER talks to RevType
 * (server to server, never from a browser). See src/lib/game-connect.ts.
 *
 * Every request:
 *   X-RevType-Site:      https://play.mygames.com   (a listed game website)
 *   X-RevType-Signature: hex HMAC-SHA256 of the raw JSON body, keyed with that
 *                        website's server key (Games → Settings)
 *
 *   POST credit  { playerKey, gameId, points, reference }
 *     Adds `points` to the player's Earn Points. `reference` is the game
 *     server's own unique id for this payout: sending the same reference again
 *     never pays twice (safe to retry). Capped per credit and per player per
 *     day (Games → Settings).
 *   POST player  { playerKey }
 *     The player's RevType name and Earn Points balance.
 */

const REF_RE = /^[A-Za-z0-9._:-]{1,100}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const origin = normalizeOrigin(req.headers.get("x-revtype-site"));
  if (!origin || !(await isAllowedGameOrigin(origin))) {
    return json({ ok: false, error: "Unknown game website (X-RevType-Site)." }, 403);
  }
  const raw = await req.text();
  if (raw.length > 10_000) return json({ ok: false, error: "Body too large." }, 413);
  if (!(await verifySiteSignature(origin, raw, req.headers.get("x-revtype-signature")))) {
    return json({ ok: false, error: "Bad signature (X-RevType-Signature)." }, 401);
  }
  let body: { playerKey?: string; gameId?: string; points?: number; reference?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Body must be JSON." }, 400);
  }

  const player = verifyPlayerKey(body.playerKey);
  if (!player || player.origin !== origin) {
    return json({ ok: false, error: "Unknown player (playerKey)." }, 404);
  }

  if (action === "player") {
    const [u, ppu] = await Promise.all([
      prisma.user.findUnique({
        where: { id: player.userId },
        select: { name: true, username: true, avatar: true, pointsBalance: true, status: true },
      }),
      getPointsPerUsd(),
    ]);
    if (!u) return json({ ok: false, error: "Unknown player (playerKey)." }, 404);
    return json({
      ok: true,
      name: u.name || u.username || "RevType member",
      avatar: absoluteAvatar(u.avatar),
      points: u.pointsBalance,
      usd: ppu > 0 ? Math.floor((u.pointsBalance / ppu) * 100) / 100 : 0,
      active: u.status !== "BANNED" && u.status !== "SUSPENDED",
    });
  }

  if (action !== "credit") return json({ ok: false, error: "Not found." }, 404);

  const points = Number(body.points);
  const reference = String(body.reference ?? "");
  if (!Number.isInteger(points) || points < 1) return json({ ok: false, error: "points must be a whole number ≥ 1." }, 400);
  if (!REF_RE.test(reference)) {
    return json({ ok: false, error: "reference must be 1–100 letters, digits or . _ : -" }, 400);
  }
  if (!body.gameId) return json({ ok: false, error: "gameId required." }, 400);

  const globals = await getGamesGlobalConfig();
  if (!globals.enabled || globals.serverMaxPerCredit <= 0) {
    return json({ ok: false, error: "Game earnings are switched off on RevType." }, 403);
  }
  if (points > globals.serverMaxPerCredit) {
    return json({ ok: false, error: `points is above the limit of ${globals.serverMaxPerCredit} per credit.` }, 400);
  }
  const game = await prisma.game.findUnique({ where: { id: body.gameId }, select: { id: true, title: true } });
  if (!game) return json({ ok: false, error: "Unknown gameId." }, 404);

  const userId = player.userId;
  const ledgerRef = `game_s2s_${siteId(origin)}_${reference}`;
  const { startOfDayUtc } = await getUserDayContext(userId);
  const pointsPerUsd = await getPointsPerUsd();

  const out = await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const status = lock[0]?.status;
    if (!status) return { code: 404 as const, body: { ok: false, error: "Unknown player (playerKey)." } };
    // Same reference again (a retry): already paid, nothing more.
    const dup = await tx.transaction.findFirst({ where: { userId, reference: ledgerRef }, select: { points: true } });
    if (dup) return { code: 200 as const, body: { ok: true, duplicate: true, credited: 0 } };
    if (status === "BANNED" || status === "SUSPENDED") {
      return { code: 403 as const, body: { ok: false, error: "This RevType account can't earn right now." } };
    }

    let credit = points;
    if (globals.serverDailyCap > 0) {
      const today = await tx.gameEarnLog
        .aggregate({ where: { userId, kind: "SERVER", createdAt: { gte: startOfDayUtc } }, _sum: { points: true } })
        .then((a) => a._sum.points ?? 0);
      credit = Math.max(0, Math.min(points, globals.serverDailyCap - today));
    }
    if (credit <= 0) {
      return { code: 200 as const, body: { ok: true, credited: 0, capped: true } };
    }

    await creditPoints(tx, {
      userId,
      points: credit,
      type: TransactionType.BONUS,
      description: `Game earnings: ${game.title}`,
      reference: ledgerRef,
      metadata: { gameId: game.id, site: origin, reference, kind: "SERVER", requested: points },
      pointsPerUsd,
    });
    await tx.gameEarnLog.create({ data: { userId, gameId: game.id, points: credit, kind: "SERVER" } });
    await tx.game.update({ where: { id: game.id }, data: { pointsAwardedTotal: { increment: credit } } });
    return { code: 200 as const, body: { ok: true, credited: credit, capped: credit < points } };
  });

  return json(out.body, out.code);
}
