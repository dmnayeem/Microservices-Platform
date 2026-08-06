import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { z } from "zod";

const questionSchema = z.object({
  question: z.string().min(3),
  questionImageUrl: z.string().optional().nullable(),
  options: z.array(z.string()).min(2).max(6),
  optionImageUrls: z.array(z.string()).optional(),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
  pointsValue: z.number().int().min(0).optional(),
});

const createQuizSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().optional(),
  category: z.string().default("General"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  timeLimitSec: z.number().int().min(30).max(3600).default(180),
  passingScore: z.number().int().min(0).max(100).default(60),
  pointsReward: z.number().int().min(0).default(50),
  xpReward: z.number().int().min(0).default(25),
  cashReward: z.number().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  cooldownHours: z.number().int().min(0).default(24),
  requiredLevel: z.number().int().min(1).default(1),
  requiredAccessLevel: z.number().int().min(0).max(1000).optional().nullable(),
  questions: z.array(questionSchema).min(1),
  aiGenerated: z.boolean().optional().default(false),
  aiPrompt: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "quizzes.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = 20;
    const skip = (page - 1) * pageSize;

    const where = status ? { status: status as never } : {};

    const [quizzes, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { _count: { select: { questions: true, attempts: true } } },
      }),
      prisma.quiz.count({ where }),
    ]);

    return NextResponse.json({
      quizzes: quizzes.map((q) => ({ ...q, cashReward: toNum(q.cashReward) })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    return NextResponse.json({ error: "Failed to fetch quizzes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "quizzes.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createQuizSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Validate correctIndex within options bounds for each question
    for (const q of data.questions) {
      if (q.correctIndex >= q.options.length) {
        return NextResponse.json(
          { error: "correctIndex out of range" },
          { status: 400 }
        );
      }
    }

    const quiz = await prisma.quiz.create({
      data: {
        title: data.title,
        description: data.description,
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
        requiredAccessLevel: data.requiredAccessLevel ?? null,
        aiGenerated: !!data.aiGenerated,
        aiPrompt: data.aiPrompt ?? null,
        createdById: session.user.id,
        questions: {
          create: data.questions.map((q, i) => ({
            order: i,
            question: q.question,
            questionImageUrl: q.questionImageUrl || null,
            options: q.options,
            optionImageUrls: q.optionImageUrls ?? [],
            correctIndex: q.correctIndex,
            explanation: q.explanation ?? null,
            pointsValue: q.pointsValue ?? 10,
          })),
        },
      },
      include: { _count: { select: { questions: true } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "QUIZ_CREATED",
        entity: "Quiz",
        entityId: quiz.id,
        newData: { title: quiz.title, questions: data.questions.length },
      },
    });

    return NextResponse.json({ success: true, quiz }, { status: 201 });
  } catch (error) {
    console.error("Error creating quiz:", error);
    return NextResponse.json({ error: "Failed to create quiz" }, { status: 500 });
  }
}
