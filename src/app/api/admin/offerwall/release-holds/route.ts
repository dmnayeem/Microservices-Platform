import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { releaseHeldOfferwallCompletions } from "@/lib/offerwall";

// POST /api/admin/offerwall/release-holds — credit any offer completions whose
// hold window has elapsed. Admin-triggered (offerwalls.manage); a scheduled
// caller can hit the same endpoint. Shares releaseHeldOfferwallCompletions().
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const released = await releaseHeldOfferwallCompletions();
  return NextResponse.json({ released });
}
