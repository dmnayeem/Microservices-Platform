import { assertPageVisible } from "@/lib/page-visibility-server";
import { planFeatureGate } from "@/lib/plan-gate";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The viewer's affiliate status + code (for the Share & earn button). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ joined: false, code: null });
  }
  // Plan switch (Admin → Packages): this plan may not use it.
  const planGated = await planFeatureGate(session.user.id, "affiliate");
  if (planGated) return planGated;
  // Super-admin page visibility: refuse when /affiliate is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/affiliate");
  if (pageHidden) return pageHidden;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { affiliateJoinedAt: true, referralCode: true },
  });
  return NextResponse.json({
    joined: !!u?.affiliateJoinedAt,
    code: u?.referralCode ?? null,
  });
}
