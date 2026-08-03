import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveThreadAccess } from "@/lib/marketplace-thread";
import type { UserRole } from "@/generated/prisma";

// POST /api/marketplace/threads/:id/read — clear the caller's unread counter.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { thread, role } = await resolveThreadAccess(
    id,
    session.user.id,
    session.user.role as UserRole | undefined
  );
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (role === "BUYER") {
    await prisma.marketplaceThread.update({ where: { id }, data: { unreadBuyer: 0 } });
  } else if (role === "SELLER") {
    await prisma.marketplaceThread.update({ where: { id }, data: { unreadSeller: 0 } });
  }
  return NextResponse.json({ success: true });
}
