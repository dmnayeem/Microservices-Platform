import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CourseStatus } from "@/generated/prisma";
import { canManageCourse, lessonContentVisible } from "@/lib/course-access";

/**
 * GET /api/courses/:id/modules — the course outline for the player.
 *
 * Previously returned EVERY lesson's body text and video URL, for any course
 * (DRAFT included), to any logged-in user. Now:
 *  - non-PUBLISHED courses are visible only to the tutor-owner / course admins
 *  - lesson content + videoUrl only for free/preview lessons, enrolled users,
 *    or the owner/admin; locked lessons carry `locked: true` instead
 *  - real `CourseModule` nesting; lessons with no module land in a trailing
 *    "Lessons" group (same `{ modules: [{ id, title, lessons }] }` shape)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const course = await prisma.course.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, title: true, status: true, tutorId: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  const manager = await canManageCourse(userId, course.tutorId);
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId } },
    select: { completedLessons: true },
  });
  // Students who already enrolled keep access while an edit is under review.
  if (course.status !== CourseStatus.PUBLISHED && !manager && !enrollment) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const [moduleRows, lessons] = await Promise.all([
    prisma.courseModule.findMany({
      where: { courseId: course.id },
      orderBy: { order: "asc" },
      select: { id: true, title: true, order: true },
    }),
    prisma.courseLesson.findMany({
      where: { courseId: course.id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        moduleId: true,
        title: true,
        duration: true,
        videoUrl: true,
        content: true,
        isFree: true,
        isPreview: true,
      },
    }),
  ]);
  const enrolled = !!enrollment;
  const completed = new Set(enrollment?.completedLessons ?? []);

  const shape = (l: (typeof lessons)[number]) => {
    const visible = lessonContentVisible(l, { enrolled, manager });
    return {
      id: l.id,
      title: l.title,
      durationMin: l.duration,
      videoUrl: visible ? (l.videoUrl ?? undefined) : undefined,
      content: visible ? (l.content ?? undefined) : undefined,
      locked: !visible,
      completed: completed.has(l.id),
    };
  };

  const knownModules = new Set(moduleRows.map((m) => m.id));
  const modules = moduleRows
    .map((m) => ({
      id: m.id,
      title: m.title,
      lessons: lessons.filter((l) => l.moduleId === m.id).map(shape),
    }))
    .filter((m) => m.lessons.length > 0);
  const loose = lessons.filter((l) => !l.moduleId || !knownModules.has(l.moduleId));
  if (loose.length > 0) {
    modules.push({
      id: "default",
      title: moduleRows.length > 0 ? "Lessons" : course.title,
      lessons: loose.map(shape),
    });
  }

  return NextResponse.json(
    { modules },
    { headers: { "Cache-Control": "no-store" } }
  );
}
