import "server-only";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { pts } from "@/lib/utils";
import { NotificationType } from "@/generated/prisma/client";
import type { CelebrationPayload } from "@/lib/celebration";

/**
 * Bell notifications (and celebration popups) for points earned from games.
 *
 * Never spammy, never on the money path:
 *   - A play session (in-app player or the game's own website) sends ONE
 *     notification when it closes, by whichever path wins the `endedAt`
 *     compare-and-set — Quit / tab close (endSession), a new game force-ending
 *     it (startSession) or the stale-session sweep (game-cron.ts).
 *   - Game-server credits (s2s) fold into the member's unread notification for
 *     the same game from the last 30 minutes instead of stacking a new row.
 *
 * Everything here runs AFTER the transaction that moved the points has
 * committed, and swallows its own errors: a failed notice must never fail a
 * session end or a credit that has already been paid.
 *
 * No email — these can be frequent; the bell, the push and the popup are enough.
 */

/** A celebration popup only for an amount worth interrupting someone for. */
export const GAME_POPUP_MIN_POINTS = 10;

/** Game-server credits within this window share one notification. */
const SERVER_COALESCE_MS = 30 * 60_000;

const LINK = "/wallet";
const ADDED = "Added to your Earn Points. Withdraw anytime from your wallet.";

function popupFor(gameTitle: string, points: number): CelebrationPayload {
  return {
    kind: "payment",
    headline: `Points from ${gameTitle}`,
    amount: `+${pts(points)} points`,
    sub: ADDED,
    cta: { label: "Open wallet", href: LINK },
  };
}

export interface ClosedGameSession {
  id: string;
  userId: string;
  gameId: string;
  /** The session's final total (read after it was closed). */
  pointsAwarded: number;
}

/**
 * One notification per closed session that earned anything. The caller passes
 * ONLY the sessions its own `endedAt` compare-and-set closed, which is what
 * makes this exactly once per session. Never throws.
 */
export async function notifyGameSessionsClosed(sessions: ClosedGameSession[]): Promise<void> {
  const paid = sessions.filter((s) => s.pointsAwarded > 0);
  if (paid.length === 0) return;
  try {
    const games = await prisma.game.findMany({
      where: { id: { in: [...new Set(paid.map((s) => s.gameId))] } },
      select: { id: true, title: true },
    });
    const titleOf = new Map(games.map((g) => [g.id, g.title]));
    for (const s of paid) {
      const title = titleOf.get(s.gameId) ?? "a game";
      const n = s.pointsAwarded;
      try {
        await notifyUser({
          userId: s.userId,
          type: NotificationType.SYSTEM,
          title: `You earned ${pts(n)} points playing ${title}`,
          message: ADDED,
          link: LINK,
          data: { gameEarnings: "session", gameId: s.gameId, sessionId: s.id, points: n },
          email: false,
          ...(n >= GAME_POPUP_MIN_POINTS ? { popup: popupFor(title, n) } : {}),
        });
      } catch (err) {
        console.error(`[game-notify] session ${s.id} notification failed:`, err);
      }
    }
  } catch (err) {
    console.error("[game-notify] session notifications failed:", err);
  }
}

/** What a coalesced game-server notification keeps in `Notification.data`. */
interface ServerNoticeData {
  gameEarningsKey?: string;
  gameId?: string;
  /** Running total this notification stands for. */
  points?: number;
  /** Points already shown in popups the member has closed. */
  popupBase?: number;
  /** The total when the current popup content was written. */
  popupAt?: number;
  [k: string]: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * A game server credited `points` (credited > 0, not a duplicate retry).
 *
 * Coalesces into the member's UNREAD notification for the same game created in
 * the last 30 minutes: its amount grows instead of a new row (and a new push)
 * per credit. The popup:
 *   - not shown yet → its amount grows with the notification;
 *   - already closed by the member → shown again for the NEW points only, once
 *     they reach GAME_POPUP_MIN_POINTS;
 *   - never had one → shown once the total reaches GAME_POPUP_MIN_POINTS.
 *
 * The update is a compare-and-set on the row as read (title carries the amount,
 * plus read / popup-seen state); if anything moved in between, a fresh
 * notification is written instead — a rare duplicate notice, never a lost one.
 * Never throws.
 */
export async function notifyGameServerCredit(opts: {
  userId: string;
  gameId: string;
  gameTitle: string;
  points: number;
}): Promise<void> {
  const { userId, gameId, gameTitle, points } = opts;
  if (!(points > 0)) return;
  const key = `server:${gameId}`;
  try {
    const prev = await prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.SYSTEM,
        isRead: false,
        createdAt: { gte: new Date(Date.now() - SERVER_COALESCE_MS) },
        data: { path: ["gameEarningsKey"], equals: key },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, data: true, popup: true, popupSeenAt: true },
    });

    if (prev) {
      const d = (prev.data && typeof prev.data === "object" ? prev.data : {}) as ServerNoticeData;
      const total = num(d.points) + points;
      const pending = prev.popup && prev.popupSeenAt === null;
      const seen = prev.popup && prev.popupSeenAt !== null;
      // Points the member has already been shown in a closed popup.
      const base = seen ? num(d.popupAt) : num(d.popupBase);
      const unseen = total - base;

      let popupData: Partial<ServerNoticeData> = {};
      let rearm = false;
      if (pending) {
        // Still waiting to be shown: it just shows the bigger amount.
        popupData = { popup: popupFor(gameTitle, unseen), popupBase: base, popupAt: total };
      } else if (unseen >= GAME_POPUP_MIN_POINTS) {
        popupData = { popup: popupFor(gameTitle, unseen), popupBase: base, popupAt: total };
        rearm = true;
      }

      const res = await prisma.notification.updateMany({
        where: { id: prev.id, isRead: false, title: prev.title, popupSeenAt: prev.popupSeenAt },
        data: {
          title: `+${pts(total)} points from ${gameTitle}`,
          message: ADDED,
          data: JSON.parse(JSON.stringify({ ...d, gameEarningsKey: key, gameId, points: total, link: LINK, ...popupData })),
          ...(rearm ? { popup: true, popupSeenAt: null } : {}),
        },
      });
      if (res.count === 1) return;
    }

    await notifyUser({
      userId,
      type: NotificationType.SYSTEM,
      title: `+${pts(points)} points from ${gameTitle}`,
      message: ADDED,
      link: LINK,
      data: {
        gameEarnings: "server",
        gameEarningsKey: key,
        gameId,
        points,
        popupBase: 0,
        ...(points >= GAME_POPUP_MIN_POINTS ? { popupAt: points } : {}),
      },
      email: false,
      ...(points >= GAME_POPUP_MIN_POINTS ? { popup: popupFor(gameTitle, points) } : {}),
    });
  } catch (err) {
    console.error(`[game-notify] server credit notification failed (user ${userId}, game ${gameId}):`, err);
  }
}
