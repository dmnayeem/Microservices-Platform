import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { courseWriteSchema, saveCourse } from "@/lib/course-write";
import { revalidatePublicCourses } from "@/lib/public-catalog-data";

async function loadOwnedCourse(courseId: string, userId: string) {
  const c = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, tutorId: true },
  });
  if (!c) return { error: "Not found", status: 404 as const };
  if (c.tutorId !== userId) return { error: "Forbidden", status: 403 as const };
  return { ok: true as const };
}

// GET /api/tutor/courses/:id — own course detail (for the edit form)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role as UserRole | undefined;
    if (!hasPermission(role, "tutor.courses.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const check = await loadOwnedCourse(id, session.user.id);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: { lessons: { orderBy: { order: "asc" } } },
        },
        lessons: { where: { moduleId: null }, orderBy: { order: "asc" } },
      },
    });
    return NextResponse.json({ course });
  } catch (error) {
    console.error("Get tutor course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// PATCH /api/tutor/courses/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role as UserRole | undefined;
    if (!hasPermission(role, "tutor.courses.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const check = await loadOwnedCourse(id, session.user.id);
    if ("error" in check) {
      return NextResponse.json({ error: check.error }, { status: check.status });
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
      actor: "tutor",
      userId: session.user.id,
      courseId: id,
    });
    revalidatePublicCourses(); // public catalog pages (lib/public-catalog-data.ts)
    return NextResponse.json({ success: true, course });
  } catch (error) {
    console.error("Update tutor course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/tutor/courses/:id — only allowed while no enrolments + not yet PUBLISHED
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role as UserRole | undefined;
    if (!hasPermission(role, "tutor.courses.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        tutorId: true,
        status: true,
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (course.tutorId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (course.status === "PUBLISHED") {
      return NextResponse.json(
        {
          error:
            "Published courses can't be deleted by tutors. Archive it or ask an admin.",
        },
        { status: 400 }
      );
    }
    if (course._count.enrollments > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete — ${course._count.enrollments} student(s) are still enrolled. Archive the course instead.`,
        },
        { status: 400 }
      );
    }
    await prisma.course.delete({ where: { id } });
    await prisma.tutorProfile.update({
      where: { userId: session.user.id },
      data: { totalCourses: { decrement: 1 } },
    });
    revalidatePublicCourses(); // public catalog pages (lib/public-catalog-data.ts)
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete tutor course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
