import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { courseWriteSchema, saveCourse } from "@/lib/course-write";

// GET /api/admin/courses/:id — full record for the edit page
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: { orderBy: { order: "asc" } },
          },
        },
        // Lessons that have no module (legacy rows from Phase 1)
        lessons: {
          where: { moduleId: null },
          orderBy: { order: "asc" },
        },
        tutor: { select: { id: true, name: true, email: true } },
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ course });
  } catch (error) {
    console.error("Get course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/courses/:id — admin full edit (also handles publish via statusAction)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
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
      courseId: id,
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_UPDATED",
        entity: "Course",
        entityId: id,
        newData: { status: course.status, title: course.title },
      },
    });
    return NextResponse.json({ success: true, course });
  } catch (error) {
    console.error("Update course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/courses/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const enrollCount = await prisma.courseEnrollment.count({
      where: { courseId: id },
    });
    if (enrollCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete — ${enrollCount} student(s) are still enrolled. Archive the course instead.`,
        },
        { status: 400 }
      );
    }
    await prisma.course.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_DELETED",
        entity: "Course",
        entityId: id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
