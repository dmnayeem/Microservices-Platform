import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { z } from "zod";
import { NotificationType } from "@/generated/prisma";

const answerSchema = z.object({
  answer: z.string().min(5).max(4000),
});

// POST /api/courses/:id/questions/:questionId/answer
// Only the course tutor or an admin with `courses.manage` may answer.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, questionId } = await params;
    const body = await req.json();
    const v = answerSchema.safeParse(body);
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
    const isTutor = course.tutorId === session.user.id;
    const isAdmin = !isTutor && (await can(session.user.id, "courses.manage"));
    if (!isTutor && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const q = await prisma.courseQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, courseId: true, askerId: true, question: true },
    });
    if (!q || q.courseId !== course.id) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const updated = await prisma.courseQuestion.update({
      where: { id: questionId },
      data: {
        answer: v.data.answer.trim(),
        answeredById: session.user.id,
        answeredAt: new Date(),
      },
    });
    // Notify the asker
    await prisma.notification.create({
      data: {
        userId: q.askerId,
        type: NotificationType.COURSE,
        title: "Your question was answered",
        message: `${course.title}: ${v.data.answer.slice(0, 200)}`,
        data: { courseId: course.id, questionId: q.id },
      },
    });
    return NextResponse.json({ question: updated });
  } catch (error) {
    console.error("Answer question failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
