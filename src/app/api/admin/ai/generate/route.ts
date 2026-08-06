import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isGeminiConfigured, generateQuizQuestions } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const schema = z.object({
  type: z.enum([
    "quiz",
    "social_post",
    "task_description",
    "course_outline",
    "article",
    "marketing_copy",
  ]),
  topic: z.string().min(2).max(500),
  tone: z.enum(["informative", "casual", "professional", "exciting"]).optional(),
  count: z.number().int().min(1).max(20).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  maxLength: z.number().int().min(20).max(2000).optional(),
  includeEmojis: z.boolean().optional(),
  includeHashtags: z.boolean().optional(),
});

async function callGemini(prompt: string): Promise<{
  success: boolean;
  text?: string;
  error?: string;
}> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { success: false, error: "Empty response" };
    return { success: true, text: String(text).trim() };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "ai.manage"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "Gemini AI not configured" },
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
    const params = validation.data;

    let result: { success: boolean; output?: unknown; error?: string };

    if (params.type === "quiz") {
      const r = await generateQuizQuestions({
        topic: params.topic,
        difficulty: params.difficulty ?? "medium",
        questionCount: params.count ?? 5,
      });
      result = r.success
        ? { success: true, output: { type: "quiz", questions: r.questions } }
        : { success: false, error: r.error };
    } else if (params.type === "social_post") {
      const prompt = `Write a ${params.tone ?? "informative"} social media post about "${params.topic}".
Max length: ${params.maxLength ?? 280} characters.
${params.includeEmojis ? "Include 1-3 relevant emojis." : "No emojis."}
${params.includeHashtags ? "Include 2-3 relevant hashtags at the end." : "No hashtags."}
Return only the post content. No quotation marks, no preamble.`;
      const r = await callGemini(prompt);
      result = r.success
        ? { success: true, output: { type: "social_post", text: r.text } }
        : { success: false, error: r.error };
    } else if (params.type === "task_description") {
      const prompt = `Write a clear task description for an earning platform.
Topic: "${params.topic}"
Include:
- 1-2 sentence overview
- Numbered steps the user must follow
- Tips for completion
Tone: ${params.tone ?? "informative"}
Return plain text, no markdown.`;
      const r = await callGemini(prompt);
      result = r.success
        ? { success: true, output: { type: "task_description", text: r.text } }
        : { success: false, error: r.error };
    } else if (params.type === "course_outline") {
      const prompt = `Write a course outline for: "${params.topic}".
Provide:
- Course title
- 1 paragraph overview
- 4-6 modules, each with 3-5 lessons (just titles)
Tone: ${params.tone ?? "professional"}
Return plain text with module/lesson hierarchy.`;
      const r = await callGemini(prompt);
      result = r.success
        ? { success: true, output: { type: "course_outline", text: r.text } }
        : { success: false, error: r.error };
    } else if (params.type === "article") {
      const prompt = `Write an article (${params.maxLength ?? 600} words max) about "${params.topic}".
Tone: ${params.tone ?? "informative"}
Include a clear introduction, 2-4 main points, and a conclusion.`;
      const r = await callGemini(prompt);
      result = r.success
        ? { success: true, output: { type: "article", text: r.text } }
        : { success: false, error: r.error };
    } else {
      // marketing_copy
      const prompt = `Write punchy marketing copy about "${params.topic}".
Tone: ${params.tone ?? "exciting"}
Length: ${params.maxLength ?? 200} chars max.
${params.includeEmojis ? "Use emojis." : ""}
Return only the copy, no preamble.`;
      const r = await callGemini(prompt);
      result = r.success
        ? { success: true, output: { type: "marketing_copy", text: r.text } }
        : { success: false, error: r.error };
    }

    // Audit log every AI call
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "AI_CONTENT_GENERATED",
        entity: "AI",
        newData: {
          type: params.type,
          topic: params.topic,
          success: result.success,
        },
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("AI generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
