import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

/** Admin: list deposits, filterable by status. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "withdrawals.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const status = new URL(request.url).searchParams.get("status") ?? undefined;

  const deposits = await prisma.deposit.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const userIds = [...new Set(deposits.map((d) => d.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, avatar: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  return NextResponse.json({
    deposits: deposits.map((d) => ({ ...d, user: byId[d.userId] ?? null })),
  });
}
