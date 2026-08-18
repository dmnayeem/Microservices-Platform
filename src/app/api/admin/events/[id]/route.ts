import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseEventTiers } from "@/lib/events-shared";
import { maxPackageAccessLevel } from "@/lib/events";

const ACTION_TYPES = [
  "TEAM_ADD",
  "TASK_COMPLETE",
  "QUIZ_COMPLETE",
  "LOTTERY_BUY",
  "UPLOAD_PROOF",
  "SOCIAL_ACTION",
] as const;

// PATCH /api/admin/events/:id — update fields (partial) or toggle isActive.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "events.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof b.title === "string" && b.title.trim()) data.title = b.title.trim();
  if ("description" in b) data.description = b.description ? String(b.description) : null;
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;
  if (
    typeof b.actionType === "string" &&
    ACTION_TYPES.includes(b.actionType as (typeof ACTION_TYPES)[number])
  ) {
    data.actionType = b.actionType;
  }
  const int = (v: unknown) => {
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  if (b.threshold !== undefined) {
    const n = int(b.threshold);
    if (n !== undefined) data.threshold = Math.max(1, n);
  }
  if (b.rewardPoints !== undefined) {
    const n = int(b.rewardPoints);
    if (n !== undefined) data.rewardPoints = n;
  }
  if (b.rewardXp !== undefined) {
    const n = int(b.rewardXp);
    if (n !== undefined) data.rewardXp = n;
  }
  if (b.requiredAccessLevel !== undefined) {
    const n = int(b.requiredAccessLevel);
    // Clamp to the top real tier so the event can't be hidden from everyone.
    if (n !== undefined)
      data.requiredAccessLevel = Math.min(n, await maxPackageAccessLevel());
  }
  if (b.startAt !== undefined) {
    const d = new Date(String(b.startAt));
    if (!isNaN(d.getTime())) data.startAt = d;
  }
  if (b.endAt !== undefined) {
    const d = new Date(String(b.endAt));
    if (!isNaN(d.getTime())) data.endAt = d;
  }
  if (b.tiers !== undefined) {
    const tiers = parseEventTiers(b.tiers);
    data.tiers = tiers.length ? tiers : null;
  }

  const event = await prisma.event.update({ where: { id }, data });
  return NextResponse.json({ event });
}

// DELETE /api/admin/events/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "events.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
