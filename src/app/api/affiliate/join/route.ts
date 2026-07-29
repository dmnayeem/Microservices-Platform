import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAffiliateConfig } from "@/lib/affiliate";

/** Opt the current user into the affiliate program (idempotent). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cfg = await getAffiliateConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ error: "Affiliate program is closed" }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { affiliateJoinedAt: true, referralCode: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.affiliateJoinedAt) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { affiliateJoinedAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true, code: user.referralCode });
}
