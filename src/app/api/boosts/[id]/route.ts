import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BOOST_MEMBER_SELECT, shapeMemberBoost } from "@/lib/boost-view";

// GET /api/boosts/:id — one of the member's own boosts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const row = await prisma.boostCampaign.findFirst({
    where: { id, userId: session.user.id },
    select: BOOST_MEMBER_SELECT,
  });
  if (!row) return NextResponse.json({ error: "Boost not found" }, { status: 404 });
  return NextResponse.json({ boost: shapeMemberBoost(row) });
}
