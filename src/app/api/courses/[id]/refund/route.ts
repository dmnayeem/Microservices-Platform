import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { z } from "zod";
import { NotificationType, CourseRefundStatus } from "@/generated/prisma";
import { getCourseSettings } from "@/lib/course-settings";

const refundSchema = z.object({
  reason: z.string().min(10).max(2000),
});

// POST /api/courses/:id/refund — student requests a refund
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const v = refundSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, title: true, tutorId: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
      select: { id: true, pricePaid: true, createdAt: true, progress: true },
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: "You aren't enrolled in this course." },
        { status: 400 }
      );
    }
    if (toNum(enrollment.pricePaid) <= 0) {
      return NextResponse.json(
        { error: "Nothing to refund — this was a free enrolment." },
        { status: 400 }
      );
    }
    const settings = await getCourseSettings();
    const windowDays = settings.refundWindowDays;
    const cutoff = new Date(
      enrollment.createdAt.getTime() + windowDays * 24 * 60 * 60 * 1000
    );
    if (Date.now() > cutoff.getTime()) {
      return NextResponse.json(
        {
          error: `Refund window has closed. Refunds are available for ${windowDays} days after enrolment.`,
        },
        { status: 400 }
      );
    }
    // Progress rule (admin-set, Courses → Settings): a course mostly
    // consumed is not refundable. 100 = progress never blocks a refund.
    if (
      settings.refundMaxProgressPercent < 100 &&
      enrollment.progress > settings.refundMaxProgressPercent
    ) {
      return NextResponse.json(
        {
          error: `Refunds are only available until you've completed ${settings.refundMaxProgressPercent}% of the course — you're at ${enrollment.progress}%.`,
        },
        { status: 400 }
      );
    }
    // One pending request per enrolment
    const open = await prisma.courseRefundRequest.findFirst({
      where: { enrollmentId: enrollment.id, status: "PENDING" },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json(
        { error: "Refund already requested — pending admin review." },
        { status: 400 }
      );
    }
    const request = await prisma.courseRefundRequest.create({
      data: {
        enrollmentId: enrollment.id,
        courseId: course.id,
        userId: session.user.id,
        reason: v.data.reason.trim(),
        status: CourseRefundStatus.PENDING,
      },
    });
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: NotificationType.COURSE,
        title: "Refund request submitted",
        message: `Your refund request for "${course.title}" is pending admin review.`,
        data: { courseId: course.id, refundRequestId: request.id },
      },
    });
    return NextResponse.json({ refundRequest: request });
  } catch (error) {
    console.error("Refund request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

