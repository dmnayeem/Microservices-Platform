import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const questionSchema = z.object({
  question: z.string().min(3),
  questionImageUrl: z.string().optional().nullable(),
  options: z.array(z.string()).min(2).max(6),
  optionImageUrls: z.array(z.string()).optional(),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
  pointsValue: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().optional().nullable(),
  category: z.string().default("General"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  timeLimitSec: z.number().int().min(30).max(3600),
  passingScore: z.number().int().min(0).max(100),
  pointsReward: z.number().int().min(0),
  xpReward: z.number().int().min(0),
  cashReward: z.number().min(0),
  maxAttempts: z.number().int().min(1),
  cooldownHours: z.number().int().min(0),
  requiredLevel: z.number().int().min(1),
  requiredAccessLevel: z.number().int().min(0).max(1000).optional().nullable(),
  questions: z.array(questionSchema).min(1),
});

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "quizzes.view"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    quiz: { ...quiz, cashReward: toNum(quiz.cashReward) },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "quizzes.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.quiz.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const v = updateSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const data = v.data;
  for (const q of data.questions) {
    if (q.correctIndex >= q.options.length) {
      return NextResponse.json({ error: "correctIndex out of range" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.quiz.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        difficulty: data.difficulty,
        status: data.status,
        timeLimitSec: data.timeLimitSec,
        passingScore: data.passingScore,
        pointsReward: data.pointsReward,
        xpReward: data.xpReward,
        cashReward: data.cashReward,
        maxAttempts: data.maxAttempts,
        cooldownHours: data.cooldownHours,
        requiredLevel: data.requiredLevel,
        // Only overwrite when explicitly provided (form may not manage it).
        ...(body.requiredAccessLevel !== undefined
          ? { requiredAccessLevel: data.requiredAccessLevel ?? null }
          : {}),
      },
    });
    // Replace questions (simple + correct given small N).
    await tx.quizQuestion.deleteMany({ where: { quizId: id } });
    await tx.quizQuestion.createMany({
      data: data.questions.map((q, i) => ({
        quizId: id,
        order: i,
        question: q.question,
        questionImageUrl: q.questionImageUrl || null,
        options: q.options,
        optionImageUrls: q.optionImageUrls ?? [],
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? null,
        pointsValue: q.pointsValue ?? 10,
      })),
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "QUIZ_UPDATED",
      entity: "Quiz",
      entityId: id,
      newData: { title: data.title, questions: data.questions.length, status: data.status },
    },
  });

  return NextResponse.json({ success: true, quiz: { id } });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "quizzes.manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.quiz.delete({ where: { id } }).catch(() => {});
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "QUIZ_DELETED",
      entity: "Quiz",
      entityId: id,
    },
  });
  return NextResponse.json({ success: true });
}
