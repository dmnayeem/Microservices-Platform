import "server-only";
import { NextResponse } from "next/server";
import { userCanFeature } from "@/lib/packages";
import { planFeatureGate } from "@/lib/plan-gate";
import { assertPageVisible } from "@/lib/page-visibility-server";
import { isServiceType } from "@/lib/marketplace-categories";

/**
 * Who may create or edit a listing of this type. Services and products are
 * separate seller programmes: a SERVICE needs `sellServices`, anything else
 * `sellMarketplace`. The create pages check this too, but the API is the
 * boundary — before this, only `marketplace` (browsing) was checked here, so
 * the seller gate could be skipped by calling the API directly.
 */
export async function listingSellerGate(
  userId: string,
  assetType: string
): Promise<NextResponse | null> {
  const service = isServiceType(assetType);
  const hidden = await assertPageVisible(userId, service ? "/services" : "/marketplace");
  if (hidden) return hidden;
  if (!(await userCanFeature(userId, "marketplace"))) {
    return NextResponse.json({ error: "Marketplace is disabled for your plan" }, { status: 403 });
  }
  return planFeatureGate(userId, service ? "sellServices" : "sellMarketplace");
}
