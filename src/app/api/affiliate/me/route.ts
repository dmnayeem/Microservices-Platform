import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The viewer's affiliate status + code (for the Share & earn button). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ joined: false, code: null });
  }
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { affiliateJoinedAt: true, referralCode: true },
  });
  return NextResponse.json({
    joined: !!u?.affiliateJoinedAt,
    code: u?.referralCode ?? null,
  });
}
