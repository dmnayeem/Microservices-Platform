import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { sanitizeTaskAudience, EMPTY_TASK_AUDIENCE } from "@/lib/task-targeting";
import { getBuyerSettings, quoteTask } from "@/lib/buyer-settings";
import { getTaskCredit } from "@/lib/task-credit";
import { detectProvider } from "@/lib/video-tasks";
import { getPlatform } from "@/lib/social-tasks";
import { validateSurveyConfig, type SurveyConfig } from "@/lib/survey-tasks";
import { buyerSurveySchema, buildBuyerSurveyConfig } from "@/lib/survey-buyer";
import type { CustomConfig } from "@/lib/custom-tasks";
import {
  buyerQuizSchema,
  buildBuyerQuizQuestions,
  buyerArticleSchema,
  buildBuyerArticleConfig,
  buyerAppInstallSchema,
  buildBuyerAppInstallConfig,
  buyerCustomSchema,
  buildBuyerCustomConfig,
} from "@/lib/buyer-task-configs";
import { validateAppInstallConfig } from "@/lib/app-install-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import type { AppInstallConfig } from "@/lib/app-install-tasks";
import type { QuizQuestionShape } from "@/lib/quiz-shape";
import {
  getBuyerScope,
  typeRefusal,
  platformRefusal,
} from "@/lib/buyer-scope";
import { KYCStatus } from "@/generated/prisma/client";
import { TransactionType, TransactionStatus, TaskType } from "@/generated/prisma/client";

// Task types this endpoint knows how to build. WHICH of them a buyer may
// actually use is an admin setting (`buyer.allowed_task_types`) checked below —
// this tuple is only the set the schema can parse.
const ALLOWED_TYPES = [
  "SOCIAL",
  "VIDEO",
  "CUSTOM",
  "SURVEY",
  "QUIZ",
  "ARTICLE",
  "APPINSTALL",
] as const;

const schema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(2000),
  type: z.enum(ALLOWED_TYPES),
  // The real floor and ceiling are admin settings (Buyer & Task Funding) and
  // are enforced after parsing; these are only sanity bounds so a hostile body
  // cannot make the arithmetic below overflow.
  pointsReward: z.number().int().min(1).max(10_000_000),
  targetCount: z.number().int().min(1).max(10_000_000), // total completions to fund
  minLevel: z.number().int().min(1).max(100).default(1),
  // SOCIAL
  socialPlatform: z.string().max(40).optional().nullable(),
  socialAction: z.string().max(40).optional().nullable(),
  socialUrl: z.string().url().optional().nullable(),
  // VIDEO
  videoUrl: z.string().url().optional().nullable(),
  watchSeconds: z.number().int().min(5).max(3600).optional(),
  // CUSTOM
  instructions: z.string().max(4000).optional().nullable(),
  custom: buyerCustomSchema.optional(),
  // SURVEY
  survey: buyerSurveySchema.optional(),
  // QUIZ / ARTICLE / APPINSTALL — one schema each, shared with the edit route.
  // See src/lib/buyer-task-configs.ts for the hazard each one answers.
  quiz: buyerQuizSchema.optional(),
  article: buyerArticleSchema.optional(),
  appInstall: buyerAppInstallSchema.optional(),
  // Audience targeting (only honored when the user has the `targetTasks` feature).
  countries: z.array(z.string().max(8)).max(50).optional(),
  genders: z.array(z.string().max(10)).max(5).optional(),
  regions: z.array(z.string().max(80)).max(100).optional(),
  divisions: z.array(z.string().max(80)).max(100).optional(),
  districts: z.array(z.string().max(80)).max(300).optional(),
  subDistricts: z.array(z.string().max(80)).max(600).optional(),
  postalCodes: z.array(z.string().max(16)).max(300).optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  maxAge: z.number().int().min(0).max(120).nullable().optional(),
});

// POST /api/tasks/create — a granted user creates a task, funding its reward pool
// from their wallet. Lands as PENDING_REVIEW for admin approval before serving.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Admin master switch comes first: turning buyer funding off has to close the
  // API even for accounts that already hold the `createTasks` feature.
  const buyer = await getBuyerSettings();
  if (!buyer.enabled) {
    return NextResponse.json(
      { error: "Buyer task creation is currently turned off." },
      { status: 403 }
    );
  }
  if (!(await userCanFeature(userId, "createTasks"))) {
    return NextResponse.json(
      { error: "Task creation isn't enabled for your account." },
      { status: 403 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  // What THIS buyer may run: the admin's global lists, minus anything
  // suspended on their account. Both are checked here as well as in the form,
  // because a form only decides what is offered.
  const scope = await getBuyerScope(userId);

  const typeStop = typeRefusal(scope, d.type);
  if (typeStop) {
    return NextResponse.json({ error: typeStop }, { status: 403 });
  }

  if (d.type === "SOCIAL" && d.socialPlatform) {
    const platformStop = platformRefusal(scope, d.socialPlatform);
    if (platformStop) {
      return NextResponse.json({ error: platformStop }, { status: 403 });
    }
  }

  if (d.pointsReward < buyer.minPointsPerTask) {
    return NextResponse.json(
      { error: `The reward must be at least ${buyer.minPointsPerTask} points per completion.` },
      { status: 400 }
    );
  }
  if (d.pointsReward > buyer.maxPointsPerTask) {
    return NextResponse.json(
      { error: `The reward can be at most ${buyer.maxPointsPerTask} points per completion.` },
      { status: 400 }
    );
  }
  if (d.targetCount > buyer.maxCompletions) {
    return NextResponse.json(
      { error: `One task can be funded for at most ${buyer.maxCompletions} completions.` },
      { status: 400 }
    );
  }

  // KYC gate. Checked here rather than at payout because the buyer is about to
  // put money in — an unverified account should be stopped before it spends,
  // not after.
  if (buyer.requireKyc) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    });
    if (me?.kycStatus !== KYCStatus.APPROVED) {
      return NextResponse.json(
        { error: "Complete KYC verification before funding a task." },
        { status: 403 }
      );
    }
  }

  if (d.type === "VIDEO" && !d.videoUrl) {
    return NextResponse.json(
      { error: "A video task needs the link to the video." },
      { status: 400 }
    );
  }

  // SURVEY. No extra feature flag: `surveyTasks` is the WORKER-side gate (it
  // decides who is shown survey tasks), and reusing it here would mean a buyer
  // could not commission a survey they are not allowed to answer. Buyer scope
  // above is the gate for creating one.
  let surveyConfig: SurveyConfig | null = null;
  if (d.type === "SURVEY") {
    if (!d.survey) {
      return NextResponse.json(
        { error: "A survey task needs at least one question." },
        { status: 400 }
      );
    }
    surveyConfig = buildBuyerSurveyConfig(d.survey);
    const check = validateSurveyConfig(surveyConfig);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? "That survey isn't valid." },
        { status: 400 }
      );
    }
  }

  // ── QUIZ ─────────────────────────────────────────────────────────────────
  // Questions are REQUIRED, not optional. A QUIZ task with no usable questions
  // makes /api/tasks/quiz fall through to Gemini generation and write the
  // result back to the task row — which would let a buyer commission unmetered
  // AI spend by leaving the builder empty. The answer key goes into
  // `Task.questions` and is never sent to a player: the runner strips it.
  let quizQuestions: QuizQuestionShape[] | null = null;
  if (d.type === "QUIZ") {
    if (!d.quiz || d.quiz.questions.length === 0) {
      return NextResponse.json(
        { error: "A quiz task needs at least one question with a correct answer." },
        { status: 400 }
      );
    }
    quizQuestions = buildBuyerQuizQuestions(d.quiz);
  }

  // ── ARTICLE (buyer writing task) ─────────────────────────────────────────
  let articleConfig: ArticleConfig | null = null;
  if (d.type === "ARTICLE") {
    if (!d.article) {
      return NextResponse.json(
        { error: "An article task needs a brief and a minimum word count." },
        { status: 400 }
      );
    }
    articleConfig = buildBuyerArticleConfig(d.article);
  }

  // ── APPINSTALL ───────────────────────────────────────────────────────────
  let appInstallConfig: AppInstallConfig | null = null;
  if (d.type === "APPINSTALL") {
    if (!d.appInstall) {
      return NextResponse.json(
        { error: "An install task needs the store link and what counts as proof." },
        { status: 400 }
      );
    }
    appInstallConfig = buildBuyerAppInstallConfig(d.appInstall);
    // The same validator the admin builder is checked with, so a buyer install
    // task and an admin one cannot drift into two dialects of the same JSON.
    const problem = validateAppInstallConfig(appInstallConfig);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
  }

  // ── CUSTOM ───────────────────────────────────────────────────────────────
  let customConfig: CustomConfig | null = null;
  if (d.type === "CUSTOM") {
    if (!d.custom) {
      return NextResponse.json(
        {
          error:
            "A custom task needs at least one field, or the worker is paid for pressing a button and you receive nothing.",
        },
        { status: 400 }
      );
    }
    customConfig = buildBuyerCustomConfig(d.custom);
  }

  if (d.type === "SOCIAL" && (!d.socialUrl || !d.socialAction)) {
    return NextResponse.json(
      { error: "Social tasks need a target URL and an action." },
      { status: 400 }
    );
  }

  // The platform must be one the catalog knows. It used to be free text, which
  // meant a buyer's social task matched no platform at all — so it got none of
  // the per-platform copy-steps and none of the Smart Auto Verification that an
  // admin-built social task gets, and every submission fell to manual review.
  if (d.type === "SOCIAL") {
    if (!d.socialPlatform) {
      return NextResponse.json(
        { error: "Pick the platform this task is for." },
        { status: 400 }
      );
    }
    const def = getPlatform(d.socialPlatform.toUpperCase());
    if (!def) {
      return NextResponse.json(
        { error: `${d.socialPlatform} isn't a platform we support.` },
        { status: 400 }
      );
    }
    if (!def.actions.some((a) => a.key === d.socialAction)) {
      return NextResponse.json(
        { error: `That action isn't available on ${def.label}.` },
        { status: 400 }
      );
    }
  }

  // Per-type gate: VIDEO self-serve additionally requires the videoTasks
  // feature, the same way SOCIAL requires socialTasks — an admin can open
  // buyer task creation without opening every kind of task.
  if (d.type === "VIDEO" && !(await userCanFeature(userId, "videoTasks"))) {
    return NextResponse.json(
      { error: "Video task creation isn't enabled for your account." },
      { status: 403 }
    );
  }

  // Per-type gate: SOCIAL self-serve additionally requires the socialTasks
  // feature (an admin can enable task creation but disable social specifically).
  if (d.type === "SOCIAL" && !(await userCanFeature(userId, "socialTasks"))) {
    return NextResponse.json(
      { error: "Social task creation isn't enabled for your account." },
      { status: 403 }
    );
  }

  // Audience targeting is a granted capability — strip it otherwise.
  const audience = (await userCanFeature(userId, "targetTasks"))
    ? sanitizeTaskAudience(d)
    : EMPTY_TASK_AUDIENCE;

  // One quote, used for the estimate, the invoice line and the ledger rows. The
  // buyer-facing calculator calls the same `quoteTask`, so what they were shown
  // and what they are charged cannot drift apart.
  const pointsPerUsd = await getPointsPerUsd();
  const quote = quoteTask({
    pointsPerCompletion: d.pointsReward,
    completions: d.targetCount,
    pointsPerUsd,
    feePercent: buyer.feePercent,
  });
  const budgetPoints = quote.budgetPoints;

  // A buyer must be able to pay for at least ONE completion before their task
  // goes live. Requiring the whole budget up front would defeat pay-as-you-go;
  // requiring nothing would let someone with an empty balance publish a task
  // that pays nobody, and the person who finds out is the worker who already
  // did the job.
  // How many tasks this buyer already has running. Without a cap one account
  // can flood the task list, and every one of them competes for the same
  // credit balance — so the twentieth task quietly dies the moment the first
  // nineteen drain it.
  if (buyer.maxActiveTasks > 0) {
    const running = await prisma.task.count({
      where: {
        fundedByUserId: userId,
        status: { in: ["ACTIVE", "PENDING_REVIEW", "PAUSED"] },
      },
    });
    if (running >= buyer.maxActiveTasks) {
      return NextResponse.json(
        {
          error: `You can have ${buyer.maxActiveTasks} task${buyer.maxActiveTasks === 1 ? "" : "s"} running at a time. Finish or cancel one first.`,
        },
        { status: 400 }
      );
    }
  }

  const oneCompletion =
    d.pointsReward +
    (buyer.feePercent > 0
      ? Math.ceil((d.pointsReward * buyer.feePercent) / 100)
      : 0);
  const credit = await getTaskCredit(userId);
  if (credit < oneCompletion) {
    return NextResponse.json(
      {
        error: `You need at least ${oneCompletion.toLocaleString()} credit to publish this task — enough for one completion. You have ${credit.toLocaleString()}.`,
        shortByPoints: oneCompletion - credit,
        buyPointsHref: "/buy-points",
      },
      { status: 402 }
    );
  }

  try {
    const task = await prisma.$transaction(async (tx) => {
      // NOTHING is charged here. Credit is spent as the task is USED — one
      // approved completion at a time, through `chargeTaskCompletion`.
      //
      // The alternative, reserving the whole budget now, strands a buyer's
      // money inside tasks that expire half-finished and then needs a refund
      // path for every way a task can end. Charging on use means a task
      // advertised to 100 people whose first 10 complete costs 10 rewards, and
      // there is never a leftover to give back.
      //
      // What protects the WORKER is not a reserved pool but the close rule:
      // the moment the buyer can no longer cover one more reward, the task
      // stops being advertised. See `chargeTaskCompletion`.

      const created = await tx.task.create({
        data: {
          title: d.title,
          description: d.description,
          instructions: d.instructions || null,
          type: d.type as TaskType,
          // Admins can waive the review queue entirely for buyer tasks.
          status: buyer.autoApproveTasks ? "ACTIVE" : "PENDING_REVIEW",
          pointsReward: d.pointsReward,
          xpReward: 0,
          totalLimit: d.targetCount,
          minLevel: d.minLevel,
          ...audience,
          autoApprove: false,
          createdById: userId,
          fundedByUserId: userId,
          budgetPoints,
          remainingBudget: budgetPoints,
          // Server-side watch tracking needs the config; `contentUrl` and
          // `duration` are what the older list views read, so both are set.
          ...(d.type === "VIDEO"
            ? {
                contentUrl: d.videoUrl ?? null,
                duration: Math.ceil((d.watchSeconds ?? 30) / 60),
                videoConfig: {
                  videoUrl: d.videoUrl ?? "",
                  provider: detectProvider(d.videoUrl ?? ""),
                  watchSeconds: d.watchSeconds ?? 30,
                  warmupSeconds: 2,
                  autoSubmit: true,
                  proofRequirements: { screenshot: false, uniqueKey: false },
                },
              }
            : {}),
          socialPlatform:
            d.type === "SOCIAL" ? d.socialPlatform?.toUpperCase() || null : null,
          socialAction: d.type === "SOCIAL" ? d.socialAction || null : null,
          socialUrl: d.type === "SOCIAL" ? d.socialUrl || null : null,
          // The runner reads `surveyConfig` and does not care who built the
          // task, so a buyer survey is answered by exactly the same screen an
          // admin survey is. One-response-per-person is enforced in
          // /api/tasks/[id]/start, also regardless of who funded it.
          // The runner reads `customConfig` and the reviewer reads the answers
          // out of it, neither asking who built the task — so a buyer custom
          // task is answered and reviewed by exactly the admin code path.
          ...(d.type === "CUSTOM" && customConfig
            ? { customConfig: customConfig as unknown as object }
            : {}),
          ...(d.type === "SURVEY" && surveyConfig
            ? { surveyConfig: surveyConfig as unknown as object }
            : {}),
          // Exactly the columns the ADMIN builder writes, so every one of these
          // is run, reviewed and graded by code that never asks who built it.
          ...(d.type === "QUIZ" && quizQuestions
            ? { questions: quizQuestions as unknown as object }
            : {}),
          ...(d.type === "ARTICLE" && articleConfig
            ? { articleConfig: articleConfig as unknown as object }
            : {}),
          ...(d.type === "APPINSTALL" && appInstallConfig
            ? { appInstallConfig: appInstallConfig as unknown as object }
            : {}),
        },
      });

      // The reward pool and the platform fee are separate rows on purpose. A
      // single combined charge makes the fee invisible in /admin/finance, and
      // the fee is the platform's revenue on this transaction — the reason the
      // buyer system exists at all.
      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          // Nothing is charged at creation, so this row records the task's
          // PROMISE, not a payment: `points` is what it may cost if every
          // completion lands. The actual spend is one row per completion.
          amount: 0,
          points: 0,
          description: `Task published — "${created.title}" (up to ${budgetPoints.toLocaleString()} pts)`,
          reference: `task_fund_${created.id}`,
          metadata: {
            taskId: created.id,
            kind: "task_fund",
            budgetPoints,
            feePoints: quote.feePoints,
            rewardUsd: quote.rewardUsd,
            feePercent: quote.feePercent,
          },
        },
      });
      return created;
    });

    return NextResponse.json(
      {
        success: true,
        id: task.id,
        pending: !buyer.autoApproveTasks,
        invoice: quote,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("Task create failed:", e);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
