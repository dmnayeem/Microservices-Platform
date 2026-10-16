import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPromotionPricing } from "@/lib/promotion";
import { promotionReviewRequired } from "@/lib/promotion-review";

/** Promotion packages for the "Promote" sheet (any authed user). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [packages, requireReview] = await Promise.all([getPromotionPricing(), promotionReviewRequired()]);
  return NextResponse.json({ packages, requireReview });
}
