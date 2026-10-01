import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { priorityForReason } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { raiseAbuseSignal } from "@/lib/abuse/signal";
import { severityForReportPriority } from "@/lib/abuse/policy";

const schema = z.object({
  targetType: z.enum(["POST", "COMMENT", "USER", "LISTING", "GROUP"]),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(50),
  details: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Per account, not per IP: a reporter's IP changes often, the account does
  // not. Enough for anyone genuinely flagging content; stops a script from
  // flooding the moderation queue.
  const rl = rateLimit(`report:${session.user.id}`, 20, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many reports. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }
  const body = await request.json().catch(() => null);
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Priority comes from the shared map. The old inline list checked for
  // `"fraud"`, but the reporting dialog submits `"scam"` for that option — so
  // scam and fraud reports were filed as routine, which is exactly backwards.
  const priority = priorityForReason(v.data.reason);

  // One open report per reporter per target. Re-reporting the same thing adds
  // no information and inflated the queue (and any "N reports" signal). The
  // reporter still sees success. A RESOLVED report does not block a new one —
  // the content may have come back.
  const already = await prisma.socialReport.findFirst({
    where: {
      contentType: v.data.targetType,
      contentId: v.data.targetId,
      reporterId: session.user.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (already) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  await prisma.socialReport.create({
    data: {
      contentType: v.data.targetType,
      contentId: v.data.targetId,
      reporterId: session.user.id,
      reason: v.data.reason.toUpperCase(),
      details: v.data.details ?? null,
      priority,
      status: "PENDING",
    },
  });

  // The moderation queue stays as it is; the report also lands in the Abuse
  // Center, where reports on the same item by the same author fold together.
  raiseAbuseSignal({
    kind: "USER_REPORT",
    severity: severityForReportPriority(priority),
    entityType: v.data.targetType.toLowerCase(),
    entityId: v.data.targetId,
    summary: `Reported ${v.data.targetType.toLowerCase()}: ${v.data.reason.toLowerCase()}`,
    evidence: { reporterId: session.user.id, reason: v.data.reason, details: v.data.details ?? null, priority },
  });

  return NextResponse.json({ success: true });
}
