import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { abuseAccess } from "@/lib/abuse/access";
import { recordAbuseSignalForCase } from "@/lib/abuse/cases";
import { CASE_STATUSES, SEVERITIES } from "@/lib/abuse/policy";
import type { Prisma } from "@/generated/prisma/client";

// GET /api/admin/abuse/cases?status=&severity=&kind=&user= — the case list.
export async function GET(req: NextRequest) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.view) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const where: Prisma.AbuseCaseWhereInput = {};
  const status = sp.get("status");
  if (status && (CASE_STATUSES as readonly string[]).includes(status)) where.status = status;
  const severity = sp.get("severity");
  if (severity && (SEVERITIES as string[]).includes(severity)) where.severity = severity;
  const kind = sp.get("kind");
  if (kind) where.kind = kind;
  const user = sp.get("user")?.trim();
  if (user) where.userId = user;

  const cases = await prisma.abuseCase.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 200 });
  return NextResponse.json({ cases });
}

const createSchema = z.object({
  kind: z.enum(["PROVIDER_COMPLAINT", "USER_REPORT"]).default("PROVIDER_COMPLAINT"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  userId: z.string().max(64).optional(),
  entityType: z.string().max(32).optional(),
  entityId: z.string().max(64).optional(),
  summary: z.string().min(3).max(1000),
  providerRef: z.string().max(200).optional(),
  details: z.string().max(10000).optional(),
});

// POST /api/admin/abuse/cases — log a complaint that arrived by email or ticket.
export async function POST(req: NextRequest) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const v = createSchema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = v.data;

  const caseId = await recordAbuseSignalForCase({
    kind: d.kind,
    severity: d.severity,
    userId: d.userId || null,
    entityType: d.entityType || undefined,
    entityId: d.entityId || null,
    summary: d.summary,
    evidence: { loggedBy: a.userId, providerRef: d.providerRef ?? null, details: d.details ?? null },
  });
  if (!caseId) return NextResponse.json({ error: "Could not open the case." }, { status: 500 });
  if (d.providerRef) await prisma.abuseCase.update({ where: { id: caseId }, data: { providerRef: d.providerRef } });

  const c = await prisma.abuseCase.findUnique({ where: { id: caseId }, select: { userId: true } });
  await writeAudit({
    actorId: a.userId,
    action: "ABUSE_CASE_LOGGED",
    entity: "AbuseCase",
    entityId: caseId,
    targetUserId: c?.userId ?? null,
    summary: `Logged an abuse complaint — ${d.summary}`.slice(0, 500),
    meta: { kind: d.kind, severity: d.severity, providerRef: d.providerRef ?? null },
  });
  return NextResponse.json({ ok: true, caseId });
}
