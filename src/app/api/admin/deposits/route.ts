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
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") ?? undefined;
  const method = sp.get("method") ?? undefined;

  const deposits = await prisma.deposit.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(method && method !== "all" ? { method } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Resolve depositing users AND reviewer admins in one lookup.
  const userIds = [
    ...new Set([
      ...deposits.map((d) => d.userId),
      ...deposits.map((d) => d.reviewedBy).filter((v): v is string => !!v),
    ]),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, avatar: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  // Distinct method keys present (for the admin filter dropdown).
  const methods = [...new Set(deposits.map((d) => d.method))].sort();

  return NextResponse.json({
    methods,
    deposits: deposits.map((d) => ({
      ...d,
      user: byId[d.userId] ?? null,
      reviewer: d.reviewedBy ? byId[d.reviewedBy] ?? null : null,
    })),
  });
}
