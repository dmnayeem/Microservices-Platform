import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AFFILIATE_COOKIE } from "@/lib/affiliate";
import { userCanFeature } from "@/lib/packages";
import {
  fundDeal,
  markDelivered,
  releaseDeal,
  refundDeal,
  cancelDeal,
  escalateToAdmin,
  type DealResult,
} from "@/lib/marketplace-deal";

const schema = z.object({
  action: z.enum(["fund", "deliver", "confirm", "cancel", "escalate", "refund"]),
  reason: z.string().max(500).optional(),
});

// POST /api/marketplace/deals/:id — buyer/seller deal actions.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const deal = await prisma.marketplaceDeal.findUnique({
    where: { id },
    select: { id: true, buyerId: true, sellerId: true },
  });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const isBuyer = deal.buyerId === userId;
  const isSeller = deal.sellerId === userId;
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  let result: DealResult;
  switch (v.data.action) {
    case "fund": {
      if (!isBuyer) return NextResponse.json({ error: "Only the buyer can fund" }, { status: 403 });
      if (!(await userCanFeature(userId, "marketplace"))) {
        return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
      }
      result = await fundDeal({
        dealId: id,
        buyerId: userId,
        affiliateCookie: request.cookies.get(AFFILIATE_COOKIE)?.value,
      });
      break;
    }
    case "deliver": {
      if (!isSeller) return NextResponse.json({ error: "Only the seller can mark delivery" }, { status: 403 });
      result = await markDelivered({ dealId: id, sellerId: userId });
      break;
    }
    case "confirm": {
      if (!isBuyer) return NextResponse.json({ error: "Only the buyer can confirm" }, { status: 403 });
      result = await releaseDeal({ dealId: id, actor: "BUYER" });
      break;
    }
    case "cancel": {
      result = await cancelDeal({ dealId: id, userId });
      break;
    }
    case "escalate": {
      result = await escalateToAdmin({ dealId: id, userId, reason: v.data.reason });
      break;
    }
    case "refund": {
      // Seller voluntarily returns the buyer's funds (always safe for the buyer).
      if (!isSeller) return NextResponse.json({ error: "Only the seller can refund voluntarily" }, { status: 403 });
      result = await refundDeal({ dealId: id, actor: "SYSTEM", reason: v.data.reason, refundAdminFee: true });
      break;
    }
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ success: true, dealId: result.dealId });
}
