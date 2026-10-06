import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CourseStatus, NotificationType } from "@/generated/prisma";
import {
  canManageCourse,
  lessonCompletionBlock,
  lessonContentVisible,
  lessonOpenedAt,
} from "@/lib/course-access";

// GET /api/courses/:id/lessons/:lessonId - Get lesson content
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const session = await auth();
    const { id, lessonId } = await params;

    // Get lesson with course info
    const lesson = await prisma.courseLesson.findFirst({
      where: {
        id: lessonId,
        courseId: id,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            status: true,
            totalLessons: true,
            tutorId: true,
          },
        },
      },
    });

    const isManager =
      !!lesson &&
      !!session?.user?.id &&
      (await canManageCourse(session.user.id, lesson.course.tutorId));

    if (!lesson) {
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      );
    }

    // Check if user is enrolled (required for non-free lessons)
    let isEnrolled = false;
    let isCompleted = false;

    if (session?.user?.id) {
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          courseId_userId: {
            userId: session.user.id,
            courseId: id,
          },
        },
      });

      isEnrolled = !!enrollment;
      if (enrollment) {
        isCompleted = enrollment.completedLessons.includes(lessonId);
      }
    }

    // Unpublished (draft / under review): owner, admins and students who
    // already enrolled only.
    if (
      lesson.course.status !== CourseStatus.PUBLISHED &&
      !isManager &&
      !isEnrolled
    ) {
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      );
    }

    // Locked unless free/preview, enrolled, or the owner/admin. The old gate
    // (`!isFree && order > 1`) leaked the first two lessons of EVERY module,
    // because `order` restarts per module.
    if (
      !lessonContentVisible(lesson, { enrolled: isEnrolled, manager: isManager })
    ) {
      return NextResponse.json(
        { error: "Please enroll in this course to access this lesson" },
        { status: 403 }
      );
    }

    // Prev/next in curriculum order: (module.order, lesson.order). Lessons
    // without a module sort after every module, as the outline shows them.
    const outline = await prisma.courseLesson.findMany({
      where: { courseId: id },
      select: {
        id: true,
        title: true,
        order: true,
        module: { select: { order: true } },
      },
    });
    outline.sort(
      (a, b) =>
        (a.module?.order ?? Number.MAX_SAFE_INTEGER) -
          (b.module?.order ?? Number.MAX_SAFE_INTEGER) || a.order - b.order
    );
    const at = outline.findIndex((l) => l.id === lesson.id);
    const pick = (i: number) =>
      i >= 0 && i < outline.length
        ? { id: outline[i].id, title: outline[i].title }
        : null;
    const prevLesson = pick(at - 1);
    const nextLesson = pick(at + 1);

    return NextResponse.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        videoUrl: lesson.videoUrl,
        duration: lesson.duration,
        order: lesson.order,
        isFree: lesson.isFree,
      },
      course: {
        id: lesson.course.id,
        title: lesson.course.title,
        totalLessons: lesson.course.totalLessons,
      },
      progress: {
        isCompleted,
        isEnrolled,
      },
      navigation: {
        prev: prevLesson,
        next: nextLesson,
      },
    });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    return NextResponse.json(
      { error: "Failed to fetch lesson" },
      { status: 500 }
    );
  }
}

// POST /api/courses/:id/lessons/:lessonId - Mark lesson as complete
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, lessonId } = await params;

    // Get enrollment
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        courseId_userId: {
          userId: session.user.id,
          courseId: id,
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { error: "Please enroll in this course first" },
        { status: 403 }
      );
    }

    // Check if already completed
    if (enrollment.completedLessons.includes(lessonId)) {
      return NextResponse.json({
        message: "Lesson already completed",
        courseProgress: enrollment.progress,
        completedLessons: enrollment.completedLessons.length,
      });
    }

    // Get lesson and course info
    const lesson = await prisma.courseLesson.findFirst({
      where: {
        id: lessonId,
        courseId: id,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            totalLessons: true,
          },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      );
    }

    // Completion needs real, server-observed progress (see course-access).
    const block = await lessonCompletionBlock({
      userId: session.user.id,
      lesson,
      openedAt: await lessonOpenedAt(enrollment.id, lesson.id, lesson.duration),
    });
    if (block) {
      return NextResponse.json({ error: block }, { status: 409 });
    }

    // Add lesson to completed list
    const newCompletedLessons = [...enrollment.completedLessons, lessonId];
    const totalLessons = lesson.course.totalLessons || 1;
    const newProgress = Math.round((newCompletedLessons.length / totalLessons) * 100);
    const courseCompleted = newProgress >= 100 && !enrollment.completedAt;

    // Update enrollment
    await prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedLessons: newCompletedLessons,
        progress: Math.min(newProgress, 100),
        ...(courseCompleted && { completedAt: new Date() }),
      },
    });

    // If course completed, create notification
    if (courseCompleted) {
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: NotificationType.ACHIEVEMENT,
          title: "Course Completed!",
          message: `Congratulations! You've completed "${lesson.course.title}"!`,
          data: {
            courseId: id,
          },
        },
      });
    }

    return NextResponse.json({
      courseProgress: Math.min(newProgress, 100),
      completedLessons: newCompletedLessons.length,
      totalLessons,
      courseCompleted,
      message: courseCompleted
        ? "Congratulations! You've completed the course!"
        : "Lesson completed!",
    });
  } catch (error) {
    console.error("Error completing lesson:", error);
    return NextResponse.json(
      { error: "Failed to complete lesson" },
      { status: 500 }
    );
  }
}
