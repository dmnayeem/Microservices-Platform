import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { getBuyerScope, platformRefusal, typeRefusal } from "@/lib/buyer-scope";
import { buyerSurveySchema, buildBuyerSurveyConfig } from "@/lib/survey-buyer";
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
import { validateSurveyConfig } from "@/lib/survey-tasks";
import { sanitizeTaskAudience, EMPTY_TASK_AUDIENCE } from "@/lib/task-targeting";
import { userCanFeature } from "@/lib/packages";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma/client";

/**
 * A buyer editing or cancelling their OWN task.
 *
 * Without this a typo meant deleting the task and building it again from
 * scratch — and since a buyer could not delete either, it meant asking an
 * admin. For the single most common mistake anyone makes.
 *
 * Ownership is in the WHERE clause on every query, so no request shape reaches
 * a task this buyer did not fund.
 *
 * ── What may change, and when ────────────────────────────────────────────────
 *
 * While the task is still PENDING_REVIEW nothing has been published, so
 * everything is editable including the reward.
 *
 * Once it is live the REWARD and the COMPLETION COUNT are frozen. People
 * choose which tasks to do based on what they pay; letting a buyer cut the
 * reward after work has started would let them change the deal underneath
 * someone mid-task. Raising it is refused for the same reason rather than for
 * fairness — a task whose terms move is one nobody can trust.
 *
 * Editing the CONTENT of a live task (title, description, link, instructions)
 * sends it back to PENDING_REVIEW. What an admin approved is what should be in
 * front of users; a buyer who could swap the link afterwards would have an
 * approval that means nothing.
 */

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(5).max(2000).optional(),
  instructions: z.string().max(4000).nullable().optional(),
  socialUrl: z.string().url().nullable().optional(),
  socialPlatform: z.string().max(40).nullable().optional(),
  socialAction: z.string().max(40).nullable().optional(),
  minLevel: z.number().int().min(1).max(100).optional(),
  // SURVEY — the whole question set, replaced wholesale. Question ids are
  // preserved by the builder, so editing a prompt never orphans the answers
  // already given under that id.
  survey: buyerSurveySchema.optional(),
  // QUIZ / ARTICLE / APPINSTALL — the SAME schemas the create route parses,
  // imported rather than restated. A second copy is how an edit ends up
  // accepting something a create refuses.
  quiz: buyerQuizSchema.optional(),
  article: buyerArticleSchema.optional(),
  appInstall: buyerAppInstallSchema.optional(),
  custom: buyerCustomSchema.optional(),
  // Only honoured while the task is still awaiting review — see above.
  pointsReward: z.number().int().min(1).max(10_000_000).optional(),
  targetCount: z.number().int().min(1).max(10_000_000).optional(),
  // Audience, same shape the create route accepts.
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

/** Statuses a buyer may still act on. */
const EDITABLE = new Set(["PENDING_REVIEW", "ACTIVE", "PAUSED"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const task = await prisma.task.findFirst({
    where: { id, fundedByUserId: userId },
    select: {
      id: true,
      title: true,
      status: true,
      type: true,
      socialPlatform: true,
      pointsReward: true,
      totalLimit: true,
      budgetPoints: true,
      remainingBudget: true,
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!EDITABLE.has(String(task.status))) {
    return NextResponse.json(
      {
        error:
          "This task has finished and can no longer be edited. Create a new one instead.",
      },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const notYetLive = task.status === "PENDING_REVIEW";

  // A platform this buyer is blocked from is blocked on EDIT too.
  //
  // Creation checks the scope; this route did not. That gap made the per-buyer
  // suspension decorative: a buyer barred from one platform could create a task
  // on a permitted one and then edit it across, which is the exact move the
  // block exists to stop. Only checked when the platform is actually being
  // changed, so a task that predates a new block can still have its typo fixed.
  if (d.socialPlatform != null && d.socialPlatform !== task.socialPlatform) {
    const scope = await getBuyerScope(userId);
    const stop = platformRefusal(scope, d.socialPlatform);
    if (stop) return NextResponse.json({ error: stop }, { status: 403 });
  }

  // ── Type scope, on EDIT as well as on create ───────────────────────────────
  //
  // `type` is deliberately absent from the patch schema: a task cannot be
  // converted from one type to another at all, so the "create a permitted type
  // then edit it across" move has nothing to land on. What CAN still cross the
  // line is the payload of a type: sending a survey to a task while SURVEY is
  // suspended on this account would let a blocked buyer keep running one. So a
  // survey edit is refused unless SURVEY is open to this buyer right now, and
  // refused outright on a task that is not a survey.
  let surveyConfig = null as ReturnType<typeof buildBuyerSurveyConfig> | null;
  if (d.survey) {
    if (task.type !== "SURVEY") {
      return NextResponse.json(
        { error: "This task isn't a survey — its questions can't be changed." },
        { status: 400 }
      );
    }
    const scope = await getBuyerScope(userId);
    const stop = typeRefusal(scope, "SURVEY");
    if (stop) return NextResponse.json({ error: stop }, { status: 403 });

    surveyConfig = buildBuyerSurveyConfig(d.survey);
    const check = validateSurveyConfig(surveyConfig);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? "That survey isn't valid." },
        { status: 400 }
      );
    }
  }

  // The same rule for the other three payload-carrying types: a config edit is
  // refused unless the task IS that type and that type is open to this buyer
  // right now. Written as a loop over a table rather than three copies of the
  // survey block, so a fourth type cannot be added with the scope check
  // forgotten.
  let quizQuestions = null as ReturnType<typeof buildBuyerQuizQuestions> | null;
  let articleConfig = null as ReturnType<typeof buildBuyerArticleConfig> | null;
  let appInstallConfig = null as ReturnType<
    typeof buildBuyerAppInstallConfig
  > | null;
  let customConfig = null as ReturnType<typeof buildBuyerCustomConfig> | null;
  const configEdits: { sent: boolean; type: string; noun: string }[] = [
    { sent: d.quiz !== undefined, type: "QUIZ", noun: "quiz" },
    { sent: d.article !== undefined, type: "ARTICLE", noun: "article task" },
    {
      sent: d.appInstall !== undefined,
      type: "APPINSTALL",
      noun: "install task",
    },
    { sent: d.custom !== undefined, type: "CUSTOM", noun: "custom task" },
  ];
  for (const edit of configEdits) {
    if (!edit.sent) continue;
    if (task.type !== edit.type) {
      return NextResponse.json(
        { error: `This task isn't a ${edit.noun} — those settings can't be changed.` },
        { status: 400 }
      );
    }
    const scope = await getBuyerScope(userId);
    const stop = typeRefusal(scope, edit.type);
    if (stop) return NextResponse.json({ error: stop }, { status: 403 });
  }
  if (d.quiz) quizQuestions = buildBuyerQuizQuestions(d.quiz);
  if (d.article) articleConfig = buildBuyerArticleConfig(d.article);
  if (d.custom) customConfig = buildBuyerCustomConfig(d.custom);
  if (d.appInstall) {
    appInstallConfig = buildBuyerAppInstallConfig(d.appInstall);
    const problem = validateAppInstallConfig(appInstallConfig);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Reward and completion count are frozen once the task has been published.
  if (!notYetLive) {
    if (d.pointsReward != null && d.pointsReward !== task.pointsReward) {
      return NextResponse.json(
        {
          error:
            "The reward can't change once a task is live — people picked it up on those terms. Pause it and create a new one at the new rate.",
        },
        { status: 400 }
      );
    }
    if (d.targetCount != null && d.targetCount !== (task.totalLimit ?? 0)) {
      return NextResponse.json(
        {
          error:
            "The number of completions can't change once a task is live. Pause it and create a new one.",
        },
        { status: 400 }
      );
    }
  }

  const buyer = await getBuyerSettings();
  if (notYetLive && d.pointsReward != null) {
    if (
      d.pointsReward < buyer.minPointsPerTask ||
      d.pointsReward > buyer.maxPointsPerTask
    ) {
      return NextResponse.json(
        {
          error: `The reward must be between ${buyer.minPointsPerTask.toLocaleString()} and ${buyer.maxPointsPerTask.toLocaleString()} points.`,
        },
        { status: 400 }
      );
    }
  }
  if (notYetLive && d.targetCount != null && d.targetCount > buyer.maxCompletions) {
    return NextResponse.json(
      {
        error: `One task can be funded for at most ${buyer.maxCompletions.toLocaleString()} completions.`,
      },
      { status: 400 }
    );
  }

  // Audience is a granted capability; strip it otherwise, exactly as creation does.
  const touchedAudience =
    d.countries || d.genders || d.regions || d.divisions || d.districts ||
    d.subDistricts || d.postalCodes || d.minAge != null || d.maxAge != null;
  const audience = touchedAudience
    ? (await userCanFeature(userId, "targetTasks"))
      ? sanitizeTaskAudience(d)
      : EMPTY_TASK_AUDIENCE
    : {};

  // Did anything users can SEE change? That is what forces re-approval.
  const contentChanged =
    d.title != null ||
    d.description != null ||
    d.instructions !== undefined ||
    d.socialUrl !== undefined ||
    d.socialPlatform !== undefined ||
    d.socialAction !== undefined ||
    d.survey !== undefined ||
    d.quiz !== undefined ||
    d.article !== undefined ||
    d.appInstall !== undefined ||
    touchedAudience;

  const backToReview = !notYetLive && contentChanged;

  const reward = notYetLive && d.pointsReward != null ? d.pointsReward : task.pointsReward;
  const count = notYetLive && d.targetCount != null ? d.targetCount : task.totalLimit ?? 0;

  await prisma.task.update({
    where: { id },
    data: {
      ...(d.title != null ? { title: d.title } : {}),
      ...(d.description != null ? { description: d.description } : {}),
      ...(d.instructions !== undefined ? { instructions: d.instructions } : {}),
      ...(d.minLevel != null ? { minLevel: d.minLevel } : {}),
      ...(task.type === "SOCIAL"
        ? {
            ...(d.socialUrl !== undefined ? { socialUrl: d.socialUrl } : {}),
            ...(d.socialPlatform !== undefined
              ? { socialPlatform: d.socialPlatform }
              : {}),
            ...(d.socialAction !== undefined
              ? { socialAction: d.socialAction }
              : {}),
          }
        : {}),
      ...(surveyConfig
        ? { surveyConfig: surveyConfig as unknown as object }
        : {}),
      ...(quizQuestions
        ? { questions: quizQuestions as unknown as object }
        : {}),
      ...(articleConfig
        ? { articleConfig: articleConfig as unknown as object }
        : {}),
      ...(customConfig
        ? { customConfig: customConfig as unknown as object }
        : {}),
      ...(appInstallConfig
        ? { appInstallConfig: appInstallConfig as unknown as object }
        : {}),
      ...audience,
      ...(notYetLive
        ? {
            pointsReward: reward,
            totalLimit: count,
            // The promise is what the task still advertises. Nothing is
            // reserved, so this is a figure to display, not money to move.
            budgetPoints: reward * count,
            remainingBudget: reward * count,
          }
        : {}),
      ...(backToReview
        ? { status: "PENDING_REVIEW", rejectionReason: null }
        : {}),
    },
  });

  await writeAudit({
    actorId: userId,
    action: "TASK_EDITED",
    entity: "Task",
    entityId: id,
    targetUserId: userId,
    summary: `Buyer edited their own task "${d.title ?? task.title}"${
      backToReview ? " — sent back for review" : ""
    }`,
    meta: { by: "buyer", backToReview, fields: Object.keys(d) },
  });

  return NextResponse.json({
    success: true,
    backToReview,
    status: backToReview ? "PENDING_REVIEW" : task.status,
  });
}

/**
 * Cancel a task for good.
 *
 * Not a hard delete: submissions are the record of work people were PAID for,
 * and the schema deliberately refuses to delete a task that has any (see the
 * `TaskSubmission.task` relation). Cancelling retires it instead — it stops
 * being advertised and stops being able to charge the buyer, which is what
 * "delete" actually means to them.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const task = await prisma.task.findFirst({
    where: { id, fundedByUserId: userId },
    select: { id: true, title: true, status: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!EDITABLE.has(String(task.status))) {
    return NextResponse.json(
      { error: "This task has already finished." },
      { status: 400 }
    );
  }

  await prisma.task.update({
    where: { id },
    data: { status: "ARCHIVED", remainingBudget: 0 },
  });

  await writeAudit({
    actorId: userId,
    action: "TASK_CANCELLED",
    entity: "Task",
    entityId: id,
    targetUserId: userId,
    summary: `Buyer cancelled their own task "${task.title}"`,
    meta: { by: "buyer", from: task.status },
  });

  // Nothing to refund — credit is only ever charged per completion, so a
  // cancelled task has already cost exactly what it delivered.
  await notifyUser({
    userId,
    type: NotificationType.SYSTEM,
    title: "Task cancelled",
    message: `"${task.title}" has been cancelled. You were only charged for the completions it already had.`,
    link: "/buyer",
  }).catch(() => {});

  return NextResponse.json({ success: true, status: "ARCHIVED" });
}
