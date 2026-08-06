import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "leaderboards.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.systemSetting.findMany({
    where: { category: "leaderboard_history" },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    cycles: rows.map((r) => r.value),
  });
}
