import "server-only";
import { writeAudit } from "@/lib/audit";
import {
  approveCpaConversion,
  rejectCpaConversion,
  reverseCpaConversion,
} from "@/lib/cpa/credit";

/**
 * One admin decision on one conversion, with its audit row. The single path the
 * per-row route and the bulk route share, so they cannot drift.
 */
export type CpaReviewAction = "approve" | "reject" | "reverse";

export interface CpaReviewOutcome {
  id: string;
  ok: boolean;
  status?: string;
  error?: string;
}

const ERRORS: Record<string, string> = {
  NOT_FOUND: "Conversion not found",
  NOT_PENDING: "Already reviewed",
  NOT_REJECTABLE: "Only pending or held conversions can be rejected",
  NOT_APPROVED: "Only approved conversions can be reversed",
};

export async function reviewCpaConversion(
  id: string,
  action: CpaReviewAction,
  adminId: string,
  reason: string | null
): Promise<CpaReviewOutcome> {
  if (action === "approve") {
    const r = await approveCpaConversion(id, adminId);
    if (!r.ok) return { id, ok: false, error: ERRORS[r.reason] ?? r.reason };
    await writeAudit({
      actorId: adminId,
      action: r.status === "HELD" ? "CPA_CONVERSION_HELD" : "CPA_CONVERSION_APPROVED",
      entity: "CpaConversion",
      entityId: id,
      targetUserId: r.userId,
      summary:
        r.status === "HELD"
          ? `Approved CPA conversion — ${r.points} pts on hold until ${r.heldUntil?.toISOString()}`
          : `Approved CPA conversion — paid ${r.points} pts`,
      meta: { points: r.points, heldUntil: r.heldUntil ?? null },
    });
    return { id, ok: true, status: r.status };
  }

  const why = (reason ?? "").trim();
  if (!why) return { id, ok: false, error: "A reason is required" };

  if (action === "reject") {
    const r = await rejectCpaConversion(id, adminId, why);
    if (!r.ok) return { id, ok: false, error: ERRORS[r.reason] ?? r.reason };
    await writeAudit({
      actorId: adminId,
      action: "CPA_CONVERSION_REJECTED",
      entity: "CpaConversion",
      entityId: id,
      targetUserId: r.userId,
      summary: `Rejected CPA conversion: ${why.slice(0, 200)}`,
      meta: { reason: why },
    });
    try {
      const { notifyUser } = await import("@/lib/notify");
      const { getCpaRetryHours } = await import("@/lib/cpa/eligibility");
      const hours = await getCpaRetryHours();
      await notifyUser({
        userId: r.userId,
        title: "Offer not approved",
        message: `Your offer submission was rejected: ${why.slice(0, 300)} — you can try it again ${hours > 0 ? `in ${hours}h` : "now"}.`,
        link: "/cpa",
      });
    } catch {
      /* best-effort */
    }
    return { id, ok: true, status: "REJECTED" };
  }

  const r = await reverseCpaConversion(id, adminId, why);
  if (!r.ok) return { id, ok: false, error: ERRORS[r.reason] ?? r.reason };
  await writeAudit({
    actorId: adminId,
    action: "CPA_CONVERSION_REVERSED",
    entity: "CpaConversion",
    entityId: id,
    targetUserId: r.userId,
    summary: `Reversed CPA conversion — took back ${r.clawedBack} of ${r.owed} pts: ${why.slice(0, 200)}`,
    meta: { owed: r.owed, clawedBack: r.clawedBack, reason: why },
  });
  return { id, ok: true, status: "REVERSED" };
}
