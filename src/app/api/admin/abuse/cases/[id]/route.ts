import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getSetting, getPlatformName } from "@/lib/system-settings";
import { abuseAccess } from "@/lib/abuse/access";
import { addEvidence } from "@/lib/abuse/evidence";
import { ABUSE_DEFAULTS, ABUSE_SETTING_KEYS } from "@/lib/abuse/policy";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/abuse/cases/[id] — the case, its evidence timeline, the people on it.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.view) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const row = await prisma.abuseCase.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Case not found" }, { status: 404 });
  const evidence = await prisma.abuseEvidence.findMany({
    where: { caseId: id },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const c = { ...row, evidence };

  const people = [c.userId, c.assignedToId, ...c.evidence.map((e) => e.createdById)].filter((x): x is string => !!x);
  const [users, contactEmail, platform] = await Promise.all([
    people.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set(people)] } },
          select: { id: true, name: true, email: true, username: true, status: true, role: true },
        })
      : Promise.resolve([]),
    getSetting<string>(ABUSE_SETTING_KEYS.email, ABUSE_DEFAULTS.email),
    getPlatformName(),
  ]);
  return NextResponse.json({
    case: c,
    users,
    contactEmail: contactEmail || ABUSE_DEFAULTS.email,
    platform,
    access: { manage: a.manage, account: a.account },
  });
}

const patchSchema = z.object({
  status: z.enum(["OPEN", "ACTIONED", "RESOLVED", "DISMISSED"]).optional(),
  resolution: z.string().max(5000).nullable().optional(),
  providerRef: z.string().max(200).nullable().optional(),
  assignToMe: z.boolean().optional(),
  unassign: z.boolean().optional(),
});

// PATCH /api/admin/abuse/cases/[id] — status, resolution, provider ticket ref, assignee.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const v = patchSchema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = v.data;

  const c = await prisma.abuseCase.findUnique({ where: { id }, select: { id: true, status: true, userId: true } });
  if (!c) return NextResponse.json({ error: "Case not found" }, { status: 404 });

  const change: { status?: string; resolution?: string | null; providerRef?: string | null; assignedToId?: string | null } = {};
  if (d.status && d.status !== c.status) change.status = d.status;
  if (d.resolution !== undefined) change.resolution = d.resolution?.trim() || null;
  if (d.providerRef !== undefined) change.providerRef = d.providerRef?.trim() || null;
  if (d.assignToMe) change.assignedToId = a.userId;
  if (d.unassign) change.assignedToId = null;
  if (Object.keys(change).length === 0) return NextResponse.json({ ok: true });

  await prisma.abuseCase.update({
    where: { id },
    // Leaving OPEN releases the dedup key, so the next signal opens a new case.
    // A reopened case gets none back: a newer identical case may already hold it.
    data: { ...change, ...(change.status ? { openKey: null } : {}) },
  });
  await addEvidence(id, "NOTE", { change, from: c.status }, a.userId);
  await writeAudit({
    actorId: a.userId,
    action: "ABUSE_CASE_UPDATED",
    entity: "AbuseCase",
    entityId: id,
    targetUserId: c.userId,
    summary: change.status ? `Abuse case ${c.status} → ${change.status}` : "Updated an abuse case",
    meta: { from: c.status, ...change },
  });
  return NextResponse.json({ ok: true });
}
