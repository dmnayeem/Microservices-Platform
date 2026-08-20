import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { sanitizeTaskAudience, EMPTY_TASK_AUDIENCE } from "@/lib/task-targeting";
import { TransactionType, TransactionStatus, TaskType } from "@/generated/prisma/client";

// Self-serve task types a user is allowed to create (no admin-only config).
const ALLOWED_TYPES = ["SOCIAL", "CUSTOM"] as const;

const schema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(2000),
  type: z.enum(ALLOWED_TYPES),
  pointsReward: z.number().int().min(1).max(100000),
  targetCount: z.number().int().min(1).max(100000), // total completions to fund
  minLevel: z.number().int().min(1).max(100).default(1),
  // SOCIAL
  socialPlatform: z.string().max(40).optional().nullable(),
  socialAction: z.string().max(40).optional().nullable(),
  socialUrl: z.string().url().optional().nullable(),
  // CUSTOM
  instructions: z.string().max(4000).optional().nullable(),
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

  if (d.type === "SOCIAL" && (!d.socialUrl || !d.socialAction)) {
    return NextResponse.json(
      { error: "Social tasks need a target URL and an action." },
      { status: 400 }
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

  const budgetPoints = d.pointsReward * d.targetCount;
  const pointsPerUsd = await getPointsPerUsd();
  const costUsd = budgetPoints / pointsPerUsd;

  try {
    const task = await prisma.$transaction(async (tx) => {
      // Atomic no-overspend wallet debit.
      const debit = await tx.user.updateMany({
        where: { id: userId, cashBalance: { gte: costUsd } },
        data: { cashBalance: { decrement: costUsd } },
      });
      if (debit.count === 0) throw new Error("INSUFFICIENT_FUNDS");

      const created = await tx.task.create({
        data: {
          title: d.title,
          description: d.description,
          instructions: d.instructions || null,
          type: d.type as TaskType,
          status: "PENDING_REVIEW",
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
          socialPlatform: d.type === "SOCIAL" ? d.socialPlatform || null : null,
          socialAction: d.type === "SOCIAL" ? d.socialAction || null : null,
          socialUrl: d.type === "SOCIAL" ? d.socialUrl || null : null,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.COMPLETED,
          amount: -costUsd,
          points: 0,
          description: `Task budget — "${created.title}"`,
          reference: `task_fund_${created.id}`,
          metadata: { taskId: created.id, kind: "task_fund", budgetPoints },
        },
      });
      return created;
    });

    return NextResponse.json(
      { success: true, id: task.id, pending: true },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
      return NextResponse.json(
        {
          error: `Insufficient wallet balance. This task needs ${usd(costUsd)} to fund ${d.targetCount} completions.`,
          shortBy: costUsd,
        },
        { status: 402 }
      );
    }
    console.error("Task create failed:", e);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
