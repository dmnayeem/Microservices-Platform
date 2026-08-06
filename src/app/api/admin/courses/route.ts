import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { courseWriteSchema, saveCourse } from "@/lib/course-write";

// GET /api/admin/courses?status=PENDING_REVIEW&q=&take=&skip=
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const q = (searchParams.get("q") ?? "").trim();
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 30)));
    const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q)
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];

    const [rows, total] = await Promise.all([
      prisma.course.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take,
        skip,
        include: {
          tutor: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { lessons: true, enrollments: true } },
        },
      }),
      prisma.course.count({ where }),
    ]);

    return NextResponse.json({ rows, total });
  } catch (error) {
    console.error("List courses failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/admin/courses — admin creates a course directly
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const v = courseWriteSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }

    const course = await saveCourse(v.data, {
      actor: "admin",
      userId: session.user.id,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_CREATED",
        entity: "Course",
        entityId: course.id,
        newData: {
          title: course.title,
          status: course.status,
          modules: v.data.modules.length,
        },
      },
    });

    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (error) {
    console.error("Create course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
