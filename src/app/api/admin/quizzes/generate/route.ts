import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { generateQuizQuestions, isGeminiConfigured } from "@/lib/gemini";
import { z } from "zod";

const schema = z.object({
  topic: z.string().min(2).max(200),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  questionCount: z.number().int().min(1).max(20).default(5),
  category: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "ai.manage")) && !(await can(session.user.id, "quizzes.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "Gemini AI is not configured. Set GEMINI_API_KEY in environment." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const validation = schema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 }
      );
    }
    const result = await generateQuizQuestions(validation.data);
    if (!result.success || !result.questions) {
      return NextResponse.json(
        { error: result.error ?? "Failed to generate questions" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, questions: result.questions });
  } catch (error) {
    console.error("Error generating quiz:", error);
    return NextResponse.json(
      { error: "Failed to generate quiz" },
      { status: 500 }
    );
  }
}
