import { NextResponse } from "next/server";

/**
 * The old fixed-price boost (1/7/30 days for Earn Points) is gone. Boosting is
 * now a targeted, budgeted campaign paid from Ad Points or Ad Fund: the
 * composer under the member's own post → POST /api/boosts. 410 so an old
 * client gets a clear answer instead of being charged the old way.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This way of boosting has been replaced. Use the Boost button under your post to set an audience and budget.",
      replacement: "/api/boosts",
      manage: "/boosts",
    },
    { status: 410 }
  );
}
