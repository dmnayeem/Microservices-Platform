import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { CourseStatus, NotificationType } from "@/generated/prisma";

const schema = z.object({
  isFeatured: z.boolean().optional(),
  featuredUntil: z.string().datetime().nullable().optional(),
  isPromoted: z.boolean().optional(),
  promotedUntil: z.string().datetime().nullable().optional(),
  // Special action: suspend / reinstate a published course
  action: z.enum(["suspend", "reinstate"]).optional(),
});

// PATCH /api/admin/courses/:id/feature
// Combined endpoint for featured / promoted toggles + suspend/reinstate.
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
    const v = schema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const d = v.data;
    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true, tutorId: true, status: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (d.isFeatured !== undefined) {
      update.isFeatured = d.isFeatured;
      if (!d.isFeatured) update.featuredUntil = null;
    }
    if (d.featuredUntil !== undefined) {
      update.featuredUntil = d.featuredUntil ? new Date(d.featuredUntil) : null;
    }
    if (d.isPromoted !== undefined) {
      update.isPromoted = d.isPromoted;
      if (!d.isPromoted) update.promotedUntil = null;
    }
    if (d.promotedUntil !== undefined) {
      update.promotedUntil = d.promotedUntil ? new Date(d.promotedUntil) : null;
    }

    let notifTitle: string | null = null;
    if (d.action === "suspend") {
      if (course.status !== CourseStatus.PUBLISHED) {
        return NextResponse.json(
          { error: "Only published courses can be suspended" },
          { status: 400 }
        );
      }
      update.status = CourseStatus.SUSPENDED;
      notifTitle = "Course suspended";
    } else if (d.action === "reinstate") {
      if (course.status !== CourseStatus.SUSPENDED) {
        return NextResponse.json(
          { error: "Only suspended courses can be reinstated" },
          { status: 400 }
        );
      }
      update.status = CourseStatus.PUBLISHED;
      notifTitle = "Course reinstated";
    }

    const updated = await prisma.course.update({
      where: { id },
      data: update,
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_FEATURE_TOGGLE",
        entity: "Course",
        entityId: id,
        newData: JSON.parse(JSON.stringify(update)),
      },
    });
    if (notifTitle && course.tutorId) {
      await prisma.notification.create({
        data: {
          userId: course.tutorId,
          type: NotificationType.COURSE,
          title: notifTitle,
          message: `Your course "${course.title}" was ${
            d.action === "suspend" ? "suspended" : "reinstated"
          } by an admin.`,
          data: { courseId: course.id, status: updated.status },
        },
      });
    }
    return NextResponse.json({ course: updated });
  } catch (error) {
    console.error("Feature toggle failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
