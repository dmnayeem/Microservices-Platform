import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CourseStatus, NotificationType } from "@/generated/prisma";

// POST /api/admin/courses/:id/approve
// Flips PENDING_REVIEW (or DRAFT, with `force`) → PUBLISHED.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "courses.approve"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);

    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true, tutorId: true, status: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      !force &&
      course.status !== CourseStatus.PENDING_REVIEW &&
      course.status !== CourseStatus.DRAFT
    ) {
      return NextResponse.json(
        { error: `Course is already ${course.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    const updated = await prisma.course.update({
      where: { id },
      data: {
        status: CourseStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    if (course.tutorId) {
      await prisma.notification.create({
        data: {
          userId: course.tutorId,
          type: NotificationType.COURSE,
          title: "Course approved 🎉",
          message: `"${course.title}" is now live. Students can find and enroll right away.`,
          data: { courseId: course.id },
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_APPROVED",
        entity: "Course",
        entityId: id,
        oldData: { status: course.status },
        newData: { status: updated.status },
      },
    });

    return NextResponse.json({ course: updated });
  } catch (error) {
    console.error("Approve course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
