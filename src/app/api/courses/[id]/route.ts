import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CourseStatus } from "@/generated/prisma";
import { toNum } from "@/lib/money";

// GET /api/courses/:id - Get course details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    // Get course
    const course = await prisma.course.findUnique({
      where: { id },
    });

    // Get lessons separately
    const lessons = await prisma.courseLesson.findMany({
      where: { courseId: id },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        duration: true,
        order: true,
        isFree: true,
      },
    });

    if (!course || course.status !== CourseStatus.PUBLISHED) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // Get user's enrollment and progress
    let enrollment = null;
    let completedLessonIds: string[] = [];

    if (session?.user?.id) {
      enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          courseId_userId: {
            userId: session.user.id,
            courseId: id,
          },
        },
      });

      if (enrollment) {
        completedLessonIds = enrollment.completedLessons;
      }
    }

    // Format lessons with progress
    const lessonsWithProgress = lessons.map((lesson, index) => ({
      ...lesson,
      isCompleted: completedLessonIds.includes(lesson.id),
      isLocked: enrollment ? false : (index > 0 && !lesson.isFree), // First lesson or free lessons unlocked
    }));

    return NextResponse.json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnail,
        category: course.category,
        difficulty: course.difficulty,
        duration: course.totalDuration,
        price: toNum(course.price),
        isFree: course.isFree,
        rating: course.rating,
        enrollmentsCount: course.enrollmentCount,
        totalLessons: course.totalLessons,
      },
      lessons: lessonsWithProgress,
      enrollment: enrollment
        ? {
            enrolledAt: enrollment.createdAt,
            progress: enrollment.progress,
            completedLessons: completedLessonIds.length,
            totalLessons: lessons.length,
            isCompleted: !!enrollment.completedAt,
            completedAt: enrollment.completedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}

// POST /api/courses/:id (a second, free-only enrol path) was removed: nothing
// called it, and it duplicated /api/courses/:id/enroll without that route's
// plan / page-visibility / idempotency checks. Enrol via /enroll.
