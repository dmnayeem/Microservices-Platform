import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  type SurveyConfig,
  type SurveyAnswers,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/survey-tasks";

interface OptionStat {
  label: string;
  count: number;
  pct: number;
}

interface PerQuestion {
  questionId: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  answeredCount: number;
  options?: OptionStat[];
  ratingHistogram?: { value: number; count: number }[];
  ratingAverage?: number;
  textSamples?: { value: string; userId: string; createdAt: string }[];
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "submissions.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      surveyConfig: true,
      pointsReward: true,
      xpReward: true,
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.type !== "SURVEY") {
    return NextResponse.json({ error: "Not a survey task" }, { status: 400 });
  }

  const cfg = task.surveyConfig as SurveyConfig | null;
  const questions: SurveyQuestion[] = Array.isArray(cfg?.questions)
    ? [...(cfg!.questions as SurveyQuestion[])].sort((a, b) => a.order - b.order)
    : [];

  // Fetch all submissions for this task. At a moderate scale (< 50K) this is
  // fast; aggregations are done in memory below for simplicity.
  const submissions = await prisma.taskSubmission.findMany({
    where: { taskId: id },
    select: {
      id: true,
      status: true,
      answers: true,
      userId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Summary
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  for (const s of submissions) {
    if (s.status === "APPROVED" || s.status === "AUTO_APPROVED") approved++;
    else if (s.status === "PENDING") pending++;
    else rejected++;
  }

  // 14-day trend (UTC)
  const now = new Date();
  const dayKeys: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(utcDateKey(d));
  }
  const trendMap = new Map<string, number>(dayKeys.map((k) => [k, 0]));
  for (const s of submissions) {
    const k = utcDateKey(new Date(s.createdAt));
    if (trendMap.has(k)) {
      trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
    }
  }
  const trend = dayKeys.map((k) => ({ date: k, count: trendMap.get(k) ?? 0 }));

  // Per-question aggregation
  const perQuestion: PerQuestion[] = questions.map((q) => {
    const result: PerQuestion = {
      questionId: q.id,
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      answeredCount: 0,
    };

    if (q.type === "MCQ_SINGLE" || q.type === "DROPDOWN") {
      const counts: Record<string, number> = {};
      for (const opt of q.options ?? []) counts[opt] = 0;
      for (const s of submissions) {
        const a = (s.answers ?? null) as SurveyAnswers | null;
        if (!a) continue;
        const v = a[q.id];
        if (typeof v === "string" && v in counts) {
          counts[v]++;
          result.answeredCount++;
        }
      }
      const total = result.answeredCount || 1;
      result.options = Object.entries(counts).map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / total) * 100),
      }));
    } else if (q.type === "MCQ_MULTI") {
      const counts: Record<string, number> = {};
      for (const opt of q.options ?? []) counts[opt] = 0;
      for (const s of submissions) {
        const a = (s.answers ?? null) as SurveyAnswers | null;
        if (!a) continue;
        const v = a[q.id];
        if (Array.isArray(v) && v.length > 0) {
          result.answeredCount++;
          for (const item of v) {
            if (typeof item === "string" && item in counts) counts[item]++;
          }
        }
      }
      const total = result.answeredCount || 1;
      result.options = Object.entries(counts).map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / total) * 100),
      }));
    } else if (q.type === "RATING") {
      const max = q.scale ?? 5;
      const hist: Record<number, number> = {};
      for (let n = 1; n <= max; n++) hist[n] = 0;
      let sum = 0;
      for (const s of submissions) {
        const a = (s.answers ?? null) as SurveyAnswers | null;
        if (!a) continue;
        const v = a[q.id];
        if (typeof v === "number" && v >= 1 && v <= max) {
          hist[v]++;
          sum += v;
          result.answeredCount++;
        }
      }
      result.ratingHistogram = Object.entries(hist).map(([k, count]) => ({
        value: Number(k),
        count,
      }));
      result.ratingAverage = result.answeredCount
        ? Math.round((sum / result.answeredCount) * 100) / 100
        : 0;
    } else {
      // SHORT_TEXT / LONG_TEXT
      const samples: { value: string; userId: string; createdAt: string }[] = [];
      for (const s of submissions) {
        const a = (s.answers ?? null) as SurveyAnswers | null;
        if (!a) continue;
        const v = a[q.id];
        if (typeof v === "string" && v.trim().length > 0) {
          result.answeredCount++;
          if (samples.length < 50) {
            samples.push({
              value: v.length > 200 ? v.slice(0, 200) + "…" : v,
              userId: s.userId,
              createdAt: new Date(s.createdAt).toISOString(),
            });
          }
        }
      }
      result.textSamples = samples;
    }

    return result;
  });

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      pointsReward: task.pointsReward,
      xpReward: task.xpReward,
    },
    summary: {
      total: submissions.length,
      approved,
      pending,
      rejected,
    },
    trend,
    perQuestion,
  });
}
