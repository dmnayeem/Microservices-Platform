import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { CourseStatus, NotificationType } from "@/generated/prisma";

const rejectSchema = z.object({
  adminNote: z.string().max(2000).optional().nullable(),
});

// POST /api/admin/courses/:id/reject — flip back to DRAFT with a note for the tutor
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
    const v = rejectSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const note = v.data.adminNote ?? null;

    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true, tutorId: true, status: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (course.status !== CourseStatus.PENDING_REVIEW) {
      return NextResponse.json(
        { error: "Only courses in PENDING_REVIEW can be rejected." },
        { status: 400 }
      );
    }

    const updated = await prisma.course.update({
      where: { id },
      data: { status: CourseStatus.DRAFT },
    });
    if (course.tutorId) {
      await prisma.notification.create({
        data: {
          userId: course.tutorId,
          type: NotificationType.COURSE,
          title: "Course not approved",
          message: note
            ? `"${course.title}" needs changes before it can go live. Reviewer note: ${note}`
            : `"${course.title}" needs changes before it can go live. Update it and re-submit.`,
          data: { courseId: course.id, adminNote: note },
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_REJECTED",
        entity: "Course",
        entityId: id,
        oldData: { status: course.status },
        newData: { status: updated.status, adminNote: note },
      },
    });

    return NextResponse.json({ course: updated });
  } catch (error) {
    console.error("Reject course failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
