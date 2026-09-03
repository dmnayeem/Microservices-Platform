import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { z } from "zod";
import {
  releaseDeal,
  refundDeal,
  assignDealAdmin,
  type DealResult,
} from "@/lib/marketplace-deal";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

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
  if (!(await can(session.user.id, "marketplace.mediate"))) {
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

  // Releasing or refunding an escrow deal hands somebody else's money to one of
  // two parties, and left no record of who decided. Only audited on success —
  // a rejected action did not happen. Recorded against the party the money
  // moved TO, with the other side in the meta.
  const deal = await prisma.marketplaceDeal
    .findUnique({ where: { id }, select: { buyerId: true, sellerId: true, amount: true } })
    .catch(() => null);
  const beneficiary =
    v.data.action === "release" ? deal?.sellerId : v.data.action === "refund" ? deal?.buyerId : null;
  await writeAudit({
    actorId: session.user.id,
    action: `MARKETPLACE_DEAL_${v.data.action.toUpperCase()}`,
    entity: "MarketplaceDeal",
    entityId: id,
    targetUserId: beneficiary ?? null,
    summary:
      v.data.action === "release"
        ? "Released escrow to the seller"
        : v.data.action === "refund"
          ? `Refunded escrow to the buyer${v.data.refundAdminFee ? " (including the admin fee)" : ""}${v.data.reason ? ` — ${v.data.reason}` : ""}`
          : "Took over this deal as mediator",
    meta: {
      buyerId: deal?.buyerId ?? null,
      sellerId: deal?.sellerId ?? null,
      amount: deal?.amount != null ? String(deal.amount) : null,
      reason: v.data.reason ?? null,
      refundAdminFee: v.data.refundAdminFee ?? false,
    },
  });

  return NextResponse.json({ success: true, dealId: result.dealId });
}
