import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/admin/courses/refunds?status=
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const where: Record<string, unknown> = {};
    if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
      where.status = status;
    }
    const rows = await prisma.courseRefundRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        course: { select: { id: true, title: true } },
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        enrollment: {
          select: { id: true, pricePaid: true, createdAt: true },
        },
      },
    });
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("List refunds failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
