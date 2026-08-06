import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { NotificationType } from "@/generated/prisma";

const schema = z.object({
  title: z.string().min(3).max(140),
  body: z.string().min(10).max(2000),
  // Scope: ALL students of any published course, or a specific course
  scope: z.enum(["all-students", "course"]).default("all-students"),
  courseId: z.string().optional().nullable(),
});

// POST /api/admin/courses/announcements
// Admin broadcasts to either every enrolled student platform-wide, or every
// student of one specific course.
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
    const v = schema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const d = v.data;

    let userIds: string[] = [];
    let courseLabel = "all courses";
    if (d.scope === "course") {
      if (!d.courseId) {
        return NextResponse.json(
          { error: "courseId required for course-scoped announcement" },
          { status: 400 }
        );
      }
      const course = await prisma.course.findUnique({
        where: { id: d.courseId },
        select: { id: true, title: true },
      });
      if (!course) {
        return NextResponse.json({ error: "Course not found" }, { status: 404 });
      }
      courseLabel = course.title;
      const enrolled = await prisma.courseEnrollment.findMany({
        where: { courseId: course.id },
        select: { userId: true },
      });
      userIds = Array.from(new Set(enrolled.map((e) => e.userId)));

      // Also persist a CourseAnnouncement row for the course's announcement feed
      await prisma.courseAnnouncement.create({
        data: {
          courseId: course.id,
          authorId: session.user.id,
          title: d.title,
          body: d.body,
        },
      });
    } else {
      // All students across the platform
      const enrolled = await prisma.courseEnrollment.findMany({
        select: { userId: true },
        distinct: ["userId"],
      });
      userIds = enrolled.map((e) => e.userId);
    }

    if (userIds.length > 0) {
      await prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: NotificationType.COURSE,
          title: `📢 ${d.title}`,
          message: `${courseLabel}: ${d.body.slice(0, 200)}`,
          data: {
            scope: d.scope,
            courseId: d.scope === "course" ? d.courseId : null,
          },
        })),
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "COURSE_ADMIN_ANNOUNCEMENT",
        entity: "Course",
        entityId: d.scope === "course" ? d.courseId ?? null : null,
        newData: { title: d.title, scope: d.scope, sent: userIds.length },
      },
    });
    return NextResponse.json({ notifiedCount: userIds.length });
  } catch (error) {
    console.error("Admin announcement failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
