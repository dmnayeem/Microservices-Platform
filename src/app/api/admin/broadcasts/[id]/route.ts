import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { deliverBroadcast } from "@/lib/broadcast";
import { z } from "zod";

/**
 * Control one broadcast: pause it, resume it, cancel it, retry the addresses
 * that failed, or push it along by hand.
 *
 * Pause exists because a send to everyone is minutes of work, and the moment
 * an admin spots a typo in something going to the whole platform, the only
 * useful control is a stop button. It stops the next batch — whatever has
 * already left cannot come back, and the screen says so rather than implying
 * otherwise.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "retry-failed", "run"]),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const broadcast = await prisma.broadcast.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!broadcast) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The failures, named. "1,203 failed" is a number nobody can act on; the
  // addresses and the reasons are what tell an owner whether their provider
  // rejected them or the addresses were junk.
  const failures = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: id, emailError: { not: null } },
    take: 100,
    select: {
      email: true,
      emailError: true,
      attempts: true,
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ broadcast, failures });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const b = await prisma.broadcast.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, emailFailed: true },
  });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const action = v.data.action;

  if (action === "pause") {
    if (b.status !== "SENDING") {
      return NextResponse.json({ error: `Cannot pause a ${b.status} broadcast` }, { status: 400 });
    }
    await prisma.broadcast.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (action === "resume") {
    if (b.status !== "PAUSED") {
      return NextResponse.json({ error: `Cannot resume a ${b.status} broadcast` }, { status: 400 });
    }
    await prisma.broadcast.update({ where: { id }, data: { status: "SENDING" } });
  } else if (action === "cancel") {
    if (b.status === "DONE" || b.status === "CANCELLED") {
      return NextResponse.json({ error: `Already ${b.status.toLowerCase()}` }, { status: 400 });
    }
    await prisma.broadcast.update({
      where: { id },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
  } else if (action === "retry-failed") {
    // Clearing `attempts` is what actually puts them back in the queue — the
    // delivery sweep skips anything that has already had three goes.
    const reset = await prisma.broadcastRecipient.updateMany({
      where: { broadcastId: id, emailAt: null, emailError: { not: null } },
      data: { attempts: 0, emailError: null },
    });
    await prisma.broadcast.update({
      where: { id },
      data: {
        status: b.status === "DONE" ? "SENDING" : b.status,
        finishedAt: null,
        emailFailed: 0,
      },
    });
    await writeAudit({
      actorId: session.user.id,
      action: "BROADCAST_RETRY",
      entity: "Broadcast",
      entityId: id,
      summary: `Retrying ${reset.count} failed email(s) for "${b.title}"`,
    });
    const pass = await deliverBroadcast(id, { maxMs: 10_000 });
    return NextResponse.json({ ok: true, requeued: reset.count, pass });
  } else {
    // "run": push it along now rather than waiting for the next tick.
    const pass = await deliverBroadcast(id, { maxMs: 20_000 });
    return NextResponse.json({ ok: true, pass });
  }

  await writeAudit({
    actorId: session.user.id,
    action: `BROADCAST_${action.toUpperCase()}`,
    entity: "Broadcast",
    entityId: id,
    summary: `${action[0].toUpperCase() + action.slice(1)}d broadcast "${b.title}"`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const b = await prisma.broadcast.findUnique({
    where: { id },
    select: { title: true, status: true, totalRecipients: true, inAppSent: true, emailSent: true },
  });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.status === "SENDING") {
    return NextResponse.json(
      { error: "Cancel it first — deleting a live send loses the record of what went out" },
      { status: 400 }
    );
  }

  // The record goes; the notifications already delivered to users do not. They
  // are their own rows and stay in people's inboxes either way.
  await prisma.broadcast.delete({ where: { id } });

  await writeAudit({
    actorId: session.user.id,
    action: "BROADCAST_DELETED",
    entity: "Broadcast",
    entityId: id,
    summary: `Deleted the record of "${b.title}" (${b.inAppSent} notified, ${b.emailSent} emailed)`,
    meta: b,
  });

  return NextResponse.json({ ok: true });
}
