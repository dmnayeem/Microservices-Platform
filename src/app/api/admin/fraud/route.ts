import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { sendNotificationEmail } from "@/lib/email";
import { canAdministerStaffAccount, type UserRole } from "@/lib/rbac";
import { WARNING_TEXT_MAX } from "@/lib/user-warnings";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  // Decide a suspension appeal. Approving reactivates the account and sets its
  // risk to `riskAfter` (default 50%): back in, but one more offence of the
  // big kinds suspends again.
  z.object({
    action: z.literal("appeal"),
    appealId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().trim().max(1000).optional(),
    riskAfter: z.number().int().min(0).max(100).optional(),
  }),
  // Set a user's risk by hand — clear a false alarm, or raise it.
  z.object({
    action: z.literal("set_risk"),
    userId: z.string().min(1),
    risk: z.number().int().min(0).max(100),
    note: z.string().trim().max(500).optional(),
  }),
  // Mark fraud events reviewed, so the "Open Fraud Alerts" badge counts only
  // what nobody has looked at. Nothing could close an event before this.
  z.object({
    action: z.literal("resolve_events"),
    eventIds: z.array(z.string().min(1)).min(1).max(500),
    status: z.enum(["DISMISSED", "ACTED"]),
    note: z.string().trim().max(500).optional(),
  }),
  // Warn a member: a pop-up on their next visit that stays until answered
  // (lib/user-warnings.ts). Their reply shows on the Fraud Monitor.
  z.object({
    action: z.literal("warn"),
    userId: z.string().min(1),
    issue: z.string().trim().min(5).max(WARNING_TEXT_MAX),
    consequence: z.string().trim().min(5).max(WARNING_TEXT_MAX),
    fraudEventId: z.string().min(1).optional(),
  }),
  // Suspend from the Fraud Monitor. Same shape as the automatic suspension:
  // the member sees the reason and can appeal. (Ban goes through
  // /api/admin/users/[id]/ban, which needs users.ban.)
  z.object({
    action: z.literal("suspend"),
    userId: z.string().min(1),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actorId = session.user.id;
  if (!(await can(actorId, "fraud.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const b = parsed.data;

  if (b.action === "warn" || b.action === "suspend") {
    const target = await prisma.user.findUnique({
      where: { id: b.userId },
      select: { id: true, role: true, status: true, name: true, email: true },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    // The same hierarchy as editing or banning the account: staff are only
    // warned or suspended by someone allowed to administer them.
    const check = canAdministerStaffAccount(session.user.role as UserRole, target.role as UserRole);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 403 });
    const who = target.name || target.email;

    if (b.action === "warn") {
      const w = await prisma.userWarning.create({
        data: {
          userId: target.id,
          issue: b.issue,
          consequence: b.consequence,
          fraudEventId: b.fraudEventId ?? null,
          createdById: actorId,
          // Due now by THIS server's clock — the one /api/warnings compares
          // with. The column default is stamped by the database, a few seconds
          // ahead, which kept a fresh warning hidden on the very next page load.
          nextShowAt: new Date(Date.now() - 5_000),
        },
        select: { id: true },
      });
      const total = await prisma.userWarning.count({ where: { userId: target.id } });
      await writeAudit({
        actorId,
        action: "FRAUD_WARNING_SENT",
        entity: "UserWarning",
        entityId: w.id,
        targetUserId: target.id,
        summary: `Sent warning #${total} to ${who}: ${b.issue.slice(0, 120)}`,
        meta: { issue: b.issue, consequence: b.consequence, fraudEventId: b.fraudEventId ?? null },
      });
      return NextResponse.json({ ok: true, id: w.id, total });
    }

    // suspend — CAS on a usable account. Not ACTIVE alone: a sign-up that
    // has not verified its email yet (PENDING_VERIFICATION) is just as live,
    // and that is exactly what most multi-account sign-ups are.
    const res = await prisma.user.updateMany({
      where: { id: target.id, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
      data: { status: "SUSPENDED", suspendedReason: b.reason, suspendedAt: new Date() },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: `This account is not active (${target.status.toLowerCase()})` }, { status: 409 });
    }
    await writeAudit({
      actorId,
      action: "USER_SUSPENDED_FROM_FRAUD_MONITOR",
      entity: "User",
      entityId: target.id,
      targetUserId: target.id,
      summary: `Suspended ${who} — ${b.reason}`,
      meta: { reason: b.reason },
    });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "resolve_events") {
    const res = await prisma.fraudEvent.updateMany({
      where: { id: { in: b.eventIds }, status: "OPEN" },
      data: { status: b.status, resolvedById: actorId, resolvedAt: new Date(), resolverNote: b.note ?? null },
    });
    await writeAudit({
      actorId,
      action: "FRAUD_EVENTS_RESOLVED",
      entity: "FraudEvent",
      summary: `Marked ${res.count} fraud event${res.count === 1 ? "" : "s"} ${b.status.toLowerCase()}`,
      meta: { eventIds: b.eventIds, status: b.status },
    });
    return NextResponse.json({ ok: true, resolved: res.count });
  }

  if (b.action === "set_risk") {
    const u = await prisma.user.findUnique({ where: { id: b.userId }, select: { fraudRisk: true } });
    if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });
    await prisma.user.update({ where: { id: b.userId }, data: { fraudRisk: b.risk } });
    await writeAudit({
      actorId,
      action: "FRAUD_RISK_SET",
      entity: "User",
      entityId: b.userId,
      targetUserId: b.userId,
      summary: `Set fraud risk from ${u.fraudRisk}% to ${b.risk}%${b.note ? ` — ${b.note}` : ""}`,
      meta: { before: u.fraudRisk, after: b.risk },
    });
    return NextResponse.json({ ok: true, risk: b.risk });
  }

  // appeal
  const appeal = await prisma.suspensionAppeal.findUnique({
    where: { id: b.appealId },
    select: { id: true, userId: true, status: true, user: { select: { email: true, status: true, fraudRisk: true } } },
  });
  if (!appeal) return NextResponse.json({ error: "Appeal not found" }, { status: 404 });

  // CAS on PENDING: two admins deciding at once decide once.
  const claimed = await prisma.suspensionAppeal.updateMany({
    where: { id: appeal.id, status: "PENDING" },
    data: { status: b.decision, adminNote: b.note ?? null, reviewedById: actorId, reviewedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This appeal has already been decided" }, { status: 409 });
  }

  const riskAfter = b.riskAfter ?? 50;
  if (b.decision === "APPROVED") {
    await prisma.user.updateMany({
      where: { id: appeal.userId, status: "SUSPENDED" },
      data: { status: "ACTIVE", fraudRisk: riskAfter, suspendedReason: null, suspendedAt: null },
    });
  }
  await writeAudit({
    actorId,
    action: b.decision === "APPROVED" ? "SUSPENSION_APPEAL_APPROVED" : "SUSPENSION_APPEAL_REJECTED",
    entity: "SuspensionAppeal",
    entityId: appeal.id,
    targetUserId: appeal.userId,
    summary:
      b.decision === "APPROVED"
        ? `Approved a suspension appeal — account reactivated, fraud risk ${appeal.user.fraudRisk}% → ${riskAfter}%`
        : `Declined a suspension appeal${b.note ? ` — ${b.note}` : ""}`,
    meta: { note: b.note ?? null, riskBefore: appeal.user.fraudRisk, riskAfter: b.decision === "APPROVED" ? riskAfter : null },
  });

  // The user cannot sign in to read an in-app notice, so the answer goes by
  // email. Transactional: it is the reply to their own request.
  if (appeal.user.email) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
    await sendNotificationEmail(
      appeal.user.email,
      b.decision === "APPROVED" ? "Your account has been reactivated" : "Your appeal was declined",
      b.decision === "APPROVED"
        ? `Your appeal was approved and your account is active again.${b.note ? `\n\n${b.note}` : ""}\n\nPlease complete every task yourself — a further violation suspends the account again.`
        : `An admin reviewed your appeal and the suspension stays in place.${b.note ? `\n\nReason: ${b.note}` : ""}`,
      b.decision === "APPROVED" ? `${base}/login` : undefined,
      { transactional: true, style: b.decision === "APPROVED" ? "SUCCESS" : "IMPORTANT", category: "admin_manual" }
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, decision: b.decision });
}
