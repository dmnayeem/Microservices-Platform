import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { REASK_MINUTES, WARNING_REPLY_MAX, type ActiveWarning } from "@/lib/user-warnings";

/**
 * The signed-in member's own warnings (sent from the Fraud Monitor).
 *
 *   GET            → the oldest unanswered warning due now, or null
 *   POST seen      { id }        → it was put on screen
 *   POST dismiss   { id }        → closed without a reply: back in REASK_MINUTES
 *   POST reply     { id, text }  → answered: never shown again
 *
 * Every write is scoped to the caller's own unanswered warning, so an id from
 * someone else's warning (or an answered one) changes nothing.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ warning: null });
  const userId = session.user.id;

  const w = await prisma.userWarning.findFirst({
    where: { userId, repliedAt: null, nextShowAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true, issue: true, consequence: true, createdAt: true, dismissCount: true },
  });
  if (!w) return NextResponse.json({ warning: null });

  const total = await prisma.userWarning.count({ where: { userId } });
  const warning: ActiveWarning = {
    id: w.id,
    issue: w.issue,
    consequence: w.consequence,
    createdAt: w.createdAt.toISOString(),
    total,
    dismissCount: w.dismissCount,
  };
  return NextResponse.json({ warning }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!rateLimit(`warning:${userId}`, 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown; action?: unknown; text?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing warning" }, { status: 400 });
  const mine = { id, userId, repliedAt: null };

  if (body?.action === "seen") {
    await prisma.userWarning.updateMany({
      where: mine,
      data: { shownCount: { increment: 1 }, lastShownAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.action === "dismiss") {
    const nextShowAt = new Date(Date.now() + REASK_MINUTES * 60_000);
    await prisma.userWarning.updateMany({
      where: mine,
      data: { dismissCount: { increment: 1 }, nextShowAt },
    });
    return NextResponse.json({ ok: true, nextShowAt: nextShowAt.toISOString() });
  }

  if (body?.action === "reply") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 2) return NextResponse.json({ error: "Write a reply first" }, { status: 400 });
    if (text.length > WARNING_REPLY_MAX) {
      return NextResponse.json({ error: `Keep the reply under ${WARNING_REPLY_MAX} characters` }, { status: 400 });
    }
    const res = await prisma.userWarning.updateMany({
      where: mine,
      data: { reply: text, repliedAt: new Date() },
    });
    if (res.count === 0) return NextResponse.json({ error: "This warning was already answered" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
