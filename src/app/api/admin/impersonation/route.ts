import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { isStaffRole } from "@/lib/staff";
import { getImpersonationAdmins, setImpersonationAdmins } from "@/lib/impersonation";

/** Super admin only — checked against the DB role, never the session token. */
async function superAdminId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  return me?.role === "SUPER_ADMIN" ? session.user.id : null;
}

// GET — which admins may use "Login as user", and which accounts are protected.
export async function GET() {
  const me = await superAdminId();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [adminIds, blocked] = await Promise.all([
    getImpersonationAdmins(),
    prisma.user.findMany({
      where: { impersonationBlocked: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);
  return NextResponse.json({ adminIds, blocked });
}

const putSchema = z.object({ adminIds: z.array(z.string().min(1).max(40)).max(500) });

// PUT — replace the list of admins allowed to use "Login as user".
export async function PUT(req: NextRequest) {
  const me = await superAdminId();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const v = putSchema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Send { adminIds: [...] }." }, { status: 400 });

  // Only real staff accounts (the super admin always has it; users never can).
  const rows = await prisma.user.findMany({
    where: { id: { in: v.data.adminIds } },
    select: { id: true, role: true },
  });
  const next = rows.filter((r) => isStaffRole(r.role) && r.role !== "SUPER_ADMIN").map((r) => r.id);
  const before = await getImpersonationAdmins();
  await setImpersonationAdmins(next);

  const added = next.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !next.includes(x));
  for (const id of added) {
    await writeAudit({ actorId: me, action: "IMPERSONATE_ACCESS_GRANTED", entity: "User", entityId: id, targetUserId: id, summary: "Allowed to use Login as user" });
  }
  for (const id of removed) {
    await writeAudit({ actorId: me, action: "IMPERSONATE_ACCESS_REVOKED", entity: "User", entityId: id, targetUserId: id, summary: "No longer allowed to use Login as user" });
  }
  return NextResponse.json({ adminIds: next });
}
