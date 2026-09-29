import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CPA_MANAGE, requireCpaAdmin } from "@/lib/cpa/admin";
import { reviewCpaConversion } from "@/lib/cpa/review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  action: z.enum(["approve", "reject", "reverse"]),
  reason: z.string().max(1000).optional().nullable(),
});

// POST /api/admin/cpa/conversions/:id  { action: "approve"|"reject"|"reverse", reason? }
// reject and reverse require a reason. Approve on an offer with holdHours > 0
// returns status "HELD" (paid later by the scheduler job "cpa-hold-release").
export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const r = await reviewCpaConversion(id, parsed.data.action, gate.userId, parsed.data.reason ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json(r);
}
