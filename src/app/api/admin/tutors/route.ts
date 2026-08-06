import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/admin/tutors?q=&suspended=true&take=50&skip=0
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
    const q = (searchParams.get("q") ?? "").trim();
    const suspendedParam = searchParams.get("suspended");
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 50)));
    const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));

    const where: {
      isSuspended?: boolean;
      user?: {
        OR: Array<
          | { name: { contains: string; mode: "insensitive" } }
          | { email: { contains: string; mode: "insensitive" } }
        >;
      };
    } = {};
    if (suspendedParam === "true") where.isSuspended = true;
    else if (suspendedParam === "false") where.isSuspended = false;
    if (q) {
      where.user = {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      prisma.tutorProfile.findMany({
        where,
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
      prisma.tutorProfile.count({ where }),
    ]);

    return NextResponse.json({ rows, total });
  } catch (error) {
    console.error("List tutors failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
