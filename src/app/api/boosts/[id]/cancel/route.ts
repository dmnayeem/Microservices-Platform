import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelBoost } from "@/lib/boost/core";
import { BOOST_MEMBER_SELECT, shapeMemberBoost } from "@/lib/boost-view";

// POST /api/boosts/:id/cancel — the owner stops a boost; cancelBoost returns the
// unspent budget to the balance it was paid from. No feature gate: a member
// whose plan lost `boost` must still be able to stop one and get the rest back.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await cancelBoost(id, session.user.id);
  const row = await prisma.boostCampaign.findFirst({
    where: { id, userId: session.user.id },
    select: BOOST_MEMBER_SELECT,
  });
  if (!row) return NextResponse.json({ error: "Boost not found" }, { status: 404 });
  if (!ok) {
    return NextResponse.json(
      { error: "This boost has already ended.", boost: shapeMemberBoost(row) },
      { status: 409 }
    );
  }
  return NextResponse.json({ boost: shapeMemberBoost(row) });
}
