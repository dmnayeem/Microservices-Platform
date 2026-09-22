import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

/**
 * Achievements: create, edit, remove.
 *
 * The model already had everything an admin needs — type, threshold, both
 * rewards, an on/off flag — and no screen to reach it, so every achievement on
 * the platform had to be inserted by hand. This is that screen's back end.
 */

interface Body {
  id?: string;
  name?: string;
  description?: string | null;
  type?: string;
  threshold?: number;
  pointsReward?: number;
  xpReward?: number;
  isActive?: boolean;
}

/** The types the unlock engine knows how to measure. */
const TYPES = new Set([
  "TASKS_COMPLETED",
  "POINTS_EARNED",
  "REFERRALS",
  "STREAK",
  "LEVEL",
]);

function clean(b: Body) {
  const name = String(b.name ?? "").trim();
  const type = String(b.type ?? "");
  const threshold = Math.round(Number(b.threshold));
  const pointsReward = Math.max(0, Math.round(Number(b.pointsReward) || 0));
  const xpReward = Math.max(0, Math.round(Number(b.xpReward) || 0));

  if (!name) return { error: "Give it a name" };
  if (name.length > 80) return { error: "Name must be 80 characters or fewer" };
  if (!TYPES.has(type)) return { error: "Pick what the achievement unlocks on" };
  if (!Number.isFinite(threshold) || threshold < 1) {
    return { error: "The threshold must be at least 1" };
  }
  return {
    data: {
      name,
      description: String(b.description ?? "").trim() || null,
      type,
      threshold,
      pointsReward,
      xpReward,
      isActive: b.isActive !== false,
    },
  };
}

async function guard() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!(await can(session.user.id, "settings.edit"))) {
    return { error: "Forbidden", status: 403 };
  }
  return { actorId: session.user.id };
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }

  const parsed = clean((await req.json().catch(() => ({}))) as Body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  /* `name` is unique on the model. Say so in words rather than letting a
     Prisma constraint error reach the admin as "P2002". */
  const clash = await prisma.achievement.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "An achievement with that name already exists" },
      { status: 409 }
    );
  }

  const row = await prisma.achievement.create({ data: parsed.data });
  await writeAudit({
    actorId: g.actorId,
    action: "ACHIEVEMENT_CREATED",
    entity: "Achievement",
    entityId: row.id,
    summary: `${row.name} — ${row.type} at ${row.threshold}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, achievement: row });
}

export async function PUT(req: NextRequest) {
  const g = await guard();
  if ("error" in g) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const parsed = clean(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const clash = await prisma.achievement.findFirst({
    where: { name: parsed.data.name, NOT: { id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "Another achievement already has that name" },
      { status: 409 }
    );
  }

  const row = await prisma.achievement.update({
    where: { id },
    data: parsed.data,
  });
  await writeAudit({
    actorId: g.actorId,
    action: "ACHIEVEMENT_UPDATED",
    entity: "Achievement",
    entityId: row.id,
    summary: `${row.name} — ${row.type} at ${row.threshold}${row.isActive ? "" : " (off)"}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, achievement: row });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const row = await prisma.achievement.findUnique({
    where: { id },
    select: { name: true, _count: { select: { users: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /* An unlock is a record of something a user did. Deleting the achievement
     takes those rows with it and erases that history, so when anyone has
     unlocked it the row is switched off instead — new unlocks stop, the record
     stays readable, and the admin is told which happened. */
  if (row._count.users > 0) {
    await prisma.achievement.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAudit({
      actorId: g.actorId,
      action: "ACHIEVEMENT_DEACTIVATED",
      entity: "Achievement",
      entityId: id,
      summary: `${row.name} switched off — ${row._count.users} user(s) had already unlocked it, so it was kept rather than deleted`,
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      deactivated: true,
      message: `${row._count.users} user(s) already unlocked this, so it was switched off instead of deleted — their record stays.`,
    });
  }

  await prisma.achievement.delete({ where: { id } });
  await writeAudit({
    actorId: g.actorId,
    action: "ACHIEVEMENT_DELETED",
    entity: "Achievement",
    entityId: id,
    summary: row.name,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
