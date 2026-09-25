import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { estimateAudience, targetFromRequest } from "@/lib/broadcast";

/**
 * POST /api/admin/notifications/estimate
 *
 * The "Estimated reach" on the send form.
 *
 * Goes through exactly the same `targetFromRequest` → `estimateAudience` path
 * as the send itself. It used to build its own filter, which approximated
 * "minimum tasks completed" as "at least one approval", dropped it whenever any
 * other filter was set, and counted "specific users" by the length of the list
 * rather than by who still exists — so the reach shown and the people reached
 * were different sets.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "notifications.send"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const target = targetFromRequest(await request.json().catch(() => ({})));
    if (!target) return NextResponse.json({ count: 0 });
    if (target.targetKind === "SPECIFIC" && target.userIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }
    if (target.targetKind === "PACKAGE" && target.packages.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: await estimateAudience(target) });
  } catch (error) {
    console.error("Error estimating reach:", error);
    return NextResponse.json({ error: "Failed to estimate reach" }, { status: 500 });
  }
}
