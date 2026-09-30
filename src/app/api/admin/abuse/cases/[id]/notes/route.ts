import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { abuseAccess } from "@/lib/abuse/access";
import { addEvidence } from "@/lib/abuse/evidence";

const schema = z.object({ note: z.string().trim().min(1).max(5000) });

// POST /api/admin/abuse/cases/[id]/notes — an admin note on the case timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const v = schema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Write a note first." }, { status: 400 });
  const c = await prisma.abuseCase.findUnique({ where: { id }, select: { userId: true } });
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  await addEvidence(id, "NOTE", { note: v.data.note }, a.userId);
  await writeAudit({
    actorId: a.userId,
    action: "ABUSE_CASE_NOTE",
    entity: "AbuseCase",
    entityId: id,
    targetUserId: c.userId,
    summary: "Added a note to an abuse case",
  });
  return NextResponse.json({ ok: true });
}
