import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { z } from "zod";
import {
  releaseDeal,
  refundDeal,
  assignDealAdmin,
  type DealResult,
} from "@/lib/marketplace-deal";

const schema = z.object({
  action: z.enum(["release", "refund", "assign"]),
  reason: z.string().max(500).optional(),
  refundAdminFee: z.boolean().optional(),
});

// POST /api/admin/marketplace/deals/:id — admin mediation actions.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "marketplace.mediate")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let result: DealResult;
  switch (v.data.action) {
    case "release":
      result = await releaseDeal({ dealId: id, actor: "ADMIN" });
      break;
    case "refund":
      result = await refundDeal({
        dealId: id,
        actor: "ADMIN",
        reason: v.data.reason,
        refundAdminFee: v.data.refundAdminFee,
      });
      break;
    case "assign":
      result = await assignDealAdmin({ dealId: id, adminId: session.user.id });
      break;
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ success: true, dealId: result.dealId });
}
