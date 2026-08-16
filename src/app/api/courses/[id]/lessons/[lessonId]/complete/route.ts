import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maybeIssueCertificate } from "@/lib/course-certificate";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, lessonId } = await params;
  const userId = session.user.id;

  const lesson = await prisma.courseLesson.findUnique({
    where: { id: lessonId },
  });
  if (!lesson || lesson.courseId !== courseId) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  // Require an EXISTING enrollment — never auto-enroll here. Previously this
  // upsert-created a free enrollment, letting a non-enrolled user mark lessons
  // complete (and self-enroll into a paid course for free). Enrollment must go
  // through the enroll route (free/paid/coupon handling).
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { courseId_userId: { courseId, userId } },
    select: { id: true, completedLessons: true, completedAt: true },
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "Not enrolled in this course." },
      { status: 403 }
    );
  }

  // Add lesson to completed set if not already
  const completedSet = new Set(enrollment.completedLessons);
  if (!completedSet.has(lessonId)) {
    completedSet.add(lessonId);

    const totalLessons = await prisma.courseLesson.count({
      where: { courseId },
    });
    const progress =
      totalLessons === 0
        ? 0
        : Math.round((completedSet.size / totalLessons) * 100);
    const isComplete = progress >= 100;

    await prisma.courseEnrollment.update({
      where: { courseId_userId: { courseId, userId } },
      data: {
        completedLessons: Array.from(completedSet),
        progress,
        ...(isComplete && !enrollment.completedAt
          ? { completedAt: new Date() }
          : {}),
      },
    });

    // Auto-issue the certificate on first 100% (parity with the /progress path).
    if (isComplete && !enrollment.completedAt) {
      await maybeIssueCertificate(enrollment.id).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
