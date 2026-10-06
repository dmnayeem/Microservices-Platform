import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { maybeIssueCertificate } from "@/lib/course-certificate";
import { lessonCompletionBlock } from "@/lib/course-access";

const patchSchema = z.object({
  watchedSeconds: z.number().int().min(0).optional(),
  totalSeconds: z.number().int().min(0).optional(),
  lastPosition: z.number().int().min(0).optional(),
  isCompleted: z.boolean().optional(),
  notes: z.unknown().optional(),
  bookmarks: z.unknown().optional(),
});

// PATCH /api/courses/:id/lessons/:lessonId/progress — autosave + complete
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, lessonId } = await params;
    const body = await req.json();
    const v = patchSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const course = await prisma.course.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
      select: { id: true, completedLessons: true },
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: "Not enrolled in this course." },
        { status: 403 }
      );
    }
    const lesson = await prisma.courseLesson.findFirst({
      where: { id: lessonId, courseId: course.id },
      select: {
        id: true,
        duration: true,
        lessonType: true,
        videoUrl: true,
        quizId: true,
        assignmentId: true,
      },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Upsert the progress row
    const data = { ...v.data };
    const existing = await prisma.courseLessonProgress.findUnique({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
        },
      },
      select: { id: true, isCompleted: true, createdAt: true },
    });
    const wasCompleted = existing?.isCompleted ?? false;

    // Completion is no longer a bare client claim: it needs real,
    // server-observed progress (first-open time on this row, quiz pass,
    // assignment submission — see course-access). A blocked completion still
    // saves the rest of the patch (and so records the first open).
    let completionBlock: string | null = null;
    if (data.isCompleted === true && !wasCompleted) {
      completionBlock = await lessonCompletionBlock({
        userId: session.user.id,
        lesson,
        openedAt: existing?.createdAt ?? null,
      });
      if (completionBlock) data.isCompleted = undefined;
    }

    const updated = await prisma.courseLessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
        },
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
        watchedSeconds: data.watchedSeconds ?? 0,
        totalSeconds: data.totalSeconds ?? lesson.duration * 60,
        lastPosition: data.lastPosition ?? 0,
        isCompleted: data.isCompleted ?? false,
        notes: data.notes as object | undefined,
        bookmarks: data.bookmarks as object | undefined,
      },
      update: {
        ...(data.watchedSeconds !== undefined && {
          watchedSeconds: data.watchedSeconds,
        }),
        ...(data.totalSeconds !== undefined && {
          totalSeconds: data.totalSeconds,
        }),
        ...(data.lastPosition !== undefined && {
          lastPosition: data.lastPosition,
        }),
        ...(data.isCompleted !== undefined && { isCompleted: data.isCompleted }),
        ...(data.notes !== undefined && { notes: data.notes as object }),
        ...(data.bookmarks !== undefined && {
          bookmarks: data.bookmarks as object,
        }),
      },
    });

    // Roll up enrollment progress + completedLessons if completion changed
    if (data.isCompleted !== undefined && data.isCompleted !== wasCompleted) {
      const totalLessons = await prisma.courseLesson.count({
        where: { courseId: course.id },
      });
      const completedRows = await prisma.courseLessonProgress.findMany({
        where: { enrollmentId: enrollment.id, isCompleted: true },
        select: { lessonId: true },
      });
      const completedIds = completedRows.map((r) => r.lessonId);
      const pct = totalLessons === 0 ? 0 : Math.round((completedIds.length / totalLessons) * 100);
      await prisma.courseEnrollment.update({
        where: { id: enrollment.id },
        data: {
          progress: pct,
          completedLessons: completedIds,
          completedAt: pct >= 100 ? new Date() : null,
        },
      });
      // If they just hit 100%, try to auto-issue the certificate.
      if (pct >= 100) {
        await maybeIssueCertificate(enrollment.id);
      }
    }

    if (completionBlock) {
      return NextResponse.json(
        { error: completionBlock, progress: updated },
        { status: 409 }
      );
    }

    return NextResponse.json({ progress: updated });
  } catch (error) {
    console.error("Lesson progress update failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
