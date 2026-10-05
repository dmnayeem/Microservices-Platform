import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessBreakdown } from "@/lib/permissions";

// GET /api/admin/control-center/staff/[id] — where one admin's access comes
// from (role default, per-user grant/block, finance grants, result). Super
// admin only: it is itself access information. Writes go through the routes
// that already own them (PATCH users/[id] for overrides, the finance team
// route for finance grants, users/[id]/modules for admin pages).

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only a super admin can see this" }, { status: 403 });
  }
  const { id } = await params;
  const b = await getAccessBreakdown(id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(b);
}
