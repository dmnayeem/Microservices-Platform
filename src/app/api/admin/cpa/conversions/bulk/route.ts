import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPA_MANAGE, requireCpaAdmin } from "@/lib/cpa/admin";
import { reviewCpaConversion, type CpaReviewOutcome } from "@/lib/cpa/review";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(1000).optional().nullable(),
});

// POST /api/admin/cpa/conversions/bulk  { ids: string[≤100], action: "approve"|"reject", reason? }
// One at a time through the same path as the single review — each conversion
// gets its own CAS, ledger row and audit row naming the affected user.
export async function POST(request: NextRequest) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { ids, action, reason } = parsed.data;
  if (action === "reject" && !reason?.trim()) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const results: CpaReviewOutcome[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      results.push(await reviewCpaConversion(id, action, gate.userId, reason ?? null));
    } catch (e) {
      console.error(`[cpa] bulk ${action} failed for ${id}:`, e);
      results.push({ id, ok: false, error: "Failed — try again" });
    }
  }
  return NextResponse.json({
    done: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
