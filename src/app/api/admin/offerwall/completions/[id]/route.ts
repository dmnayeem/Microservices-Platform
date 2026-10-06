import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { releaseHeldCompletion, rejectPendingCompletion } from "@/lib/offerwall";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).optional(),
});

// PATCH /api/admin/offerwall/completions/[id] — approve or reject a PENDING
// offerwall completion (proof review / held credit). Approval pays through
// releaseHeldCompletion() — the same status CAS + ledger reference the hold
// cron and the callback queue use — so no path can pay a completion twice.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { action, note } = v.data;
  if (action === "REJECT" && !note?.trim())
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

  const c = await prisma.offerwallCompletion.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, points: true, offer: { select: { title: true } } },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (c.status !== "PENDING")
    return NextResponse.json({ error: `Already ${c.status.toLowerCase()}` }, { status: 409 });

  if (action === "APPROVE") {
    const paid = await releaseHeldCompletion(c.id);
    if (!paid) {
      const [now, owner] = await Promise.all([
        prisma.offerwallCompletion.findUnique({ where: { id }, select: { status: true } }),
        prisma.user.findUnique({ where: { id: c.userId }, select: { status: true } }),
      ]);
      const reason =
        now?.status !== "PENDING"
          ? `Already ${now?.status.toLowerCase() ?? "gone"}`
          : owner?.status !== "ACTIVE"
          ? `The account is ${owner?.status ?? "missing"} — reactivate it before paying`
          : "Could not be paid — try again";
      return NextResponse.json({ error: reason }, { status: 409 });
    }
    await prisma.offerwallCompletion.update({
      where: { id },
      data: { reviewedById: session.user.id, reviewNote: note?.trim() || null },
    });
    await writeAudit({
      actorId: session.user.id,
      action: "OFFERWALL_COMPLETION_APPROVED",
      entity: "OfferwallCompletion",
      entityId: id,
      targetUserId: c.userId,
      summary: `Approved offerwall completion "${c.offer.title}" (+${c.points} pts)`,
      meta: { points: c.points, note: note ?? null },
    });
    return NextResponse.json({ success: true, credited: c.points });
  }

  const rejected = await rejectPendingCompletion(c.id, session.user.id, note!.trim());
  if (!rejected) return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  await writeAudit({
    actorId: session.user.id,
    action: "OFFERWALL_COMPLETION_REJECTED",
    entity: "OfferwallCompletion",
    entityId: id,
    targetUserId: c.userId,
    summary: `Rejected offerwall completion "${c.offer.title}": ${note!.trim().slice(0, 120)}`,
    meta: { points: c.points, note },
  });
  return NextResponse.json({ success: true });
}
