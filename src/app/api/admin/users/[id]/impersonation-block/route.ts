import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

const schema = z.object({ blocked: z.boolean() });

// PATCH — super admin protects (or unprotects) an account from "Login as user".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Only the super admin can change this." }, { status: 403 });

  const v = schema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Send { blocked: true|false }." }, { status: 400 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, impersonationBlocked: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.impersonationBlocked !== v.data.blocked) {
    await prisma.user.update({ where: { id }, data: { impersonationBlocked: v.data.blocked } });
    await writeAudit({
      actorId: session.user.id,
      action: v.data.blocked ? "IMPERSONATE_BLOCKED" : "IMPERSONATE_UNBLOCKED",
      entity: "User",
      entityId: id,
      targetUserId: id,
      summary: v.data.blocked ? "Blocked Login as user for this account" : "Allowed Login as user for this account again",
    });
  }
  return NextResponse.json({ blocked: v.data.blocked });
}
