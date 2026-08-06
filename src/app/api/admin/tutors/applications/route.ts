import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { TutorApplicationStatus } from "@/generated/prisma";

// GET /api/admin/tutors/applications?status=PENDING&take=50&skip=0
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "tutor.applications.review"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status")?.toUpperCase();
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 50)));
    const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));
    const status =
      statusParam && statusParam in TutorApplicationStatus
        ? (statusParam as TutorApplicationStatus)
        : undefined;

    const [rows, total, counts] = await Promise.all([
      prisma.tutorApplication.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.tutorApplication.count({
        where: status ? { status } : undefined,
      }),
      prisma.tutorApplication.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const summary = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    } as Record<TutorApplicationStatus, number>;
    for (const c of counts as Array<{ status: TutorApplicationStatus; _count: { _all: number } }>) {
      summary[c.status] = c._count._all;
    }

    return NextResponse.json({ rows, total, summary });
  } catch (error) {
    console.error("List tutor applications failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
