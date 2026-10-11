import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { parseContestInput } from "@/lib/contests";
import { contestAdminGuard } from "@/lib/contests-admin";

/**
 * PUT `{ ...fields }` edits; `{ action: "publish" | "cancel" | "unpublish" }`
 * changes status. A finished contest is final (its points are paid).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await contestAdminGuard("events.manage");
  if ("res" in g) return g.res;
  const { id } = await params;
  const existing = await prisma.contest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "FINISHED") {
    return NextResponse.json({ error: "A finished contest can't be changed." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (typeof body.action === "string") {
    const to =
      body.action === "publish"
        ? "PUBLISHED"
        : body.action === "cancel"
          ? "CANCELLED"
          : body.action === "unpublish"
            ? "DRAFT"
            : null;
    if (!to) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    await prisma.contest.update({ where: { id }, data: { status: to } });
    await writeAudit({
      actorId: g.userId,
      action: `CONTEST_${to}`,
      entity: "Contest",
      entityId: id,
      summary: `Contest "${existing.title}" → ${to}`,
    });
    return NextResponse.json({ ok: true, status: to });
  }

  const parsed = parseContestInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const contest = await prisma.contest.update({ where: { id }, data: { ...v, prizes: v.prizes as never } });
  await writeAudit({
    actorId: g.userId,
    action: "CONTEST_UPDATED",
    entity: "Contest",
    entityId: id,
    summary: `Edited contest "${v.title}"`,
  });
  return NextResponse.json({ ok: true, contest });
}
