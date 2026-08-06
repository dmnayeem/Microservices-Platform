import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { closeDueAuctions } from "@/lib/marketplace-auctions";

// POST /api/admin/marketplace/auctions/close-due
//
// Admin manual trigger to settle every auction-mode listing whose
// `auctionEndsAt` passed and is still ACTIVE. The scheduled version lives at
// /api/cron/marketplace-auctions; both share `closeDueAuctions`.
//
// Auth: admin (`marketplace.manage`). Returns a summary of what changed.
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "marketplace.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const summary = await closeDueAuctions();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Auto-close auctions failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
