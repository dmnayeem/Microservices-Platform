import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { z } from "zod";

const PLAN_INPUT = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes only"),
    name: z.string().min(1).max(80),
    description: z.string().max(500).optional().nullable(),
    accessLevel: z.number().int().min(0).max(1000),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),

    priceMonthly: z.number().min(0),
    priceYearly: z.number().min(0).optional().nullable(),
    validityDays: z.number().int().min(0).optional().nullable(),

    // Section toggles
    tasksEnabled: z.boolean(),
    socialFeedEnabled: z.boolean(),
    referralsEnabled: z.boolean(),
    withdrawalsEnabled: z.boolean(),
    marketplaceEnabled: z.boolean(),
    boostEnabled: z.boolean(),
    dailyMissionEnabled: z.boolean(),
    lotteryEnabled: z.boolean(),
    coursesEnabled: z.boolean(),
    advertiserEnabled: z.boolean().optional(),
    gamesEnabled: z.boolean().optional(),
    adFree: z.boolean().optional(),

    // Creator / monetization capabilities
    createTasksEnabled: z.boolean().optional(),
    sellCoursesEnabled: z.boolean().optional(),
    sellMarketplaceEnabled: z.boolean().optional(),
    agencyModeEnabled: z.boolean().optional(),
    shareLinksEnabled: z.boolean().optional(),
    shareYoutubeEnabled: z.boolean().optional(),

    // Per-task-type toggles
    socialTasksEnabled: z.boolean(),
    proxyTasksEnabled: z.boolean(),
    articleTasksEnabled: z.boolean(),
    videoTasksEnabled: z.boolean(),
    quizTasksEnabled: z.boolean(),
    surveyTasksEnabled: z.boolean(),
    offerwallTasksEnabled: z.boolean(),
    appInstallEnabled: z.boolean().optional(),

    // Limits
    dailyTaskLimit: z.number().int().min(-1).max(100000),
    dailyPostLimit: z.number().int().min(-1).max(100000).optional(),
    minWithdrawal: z.number().min(0),
    withdrawalFeeDiscount: z.number().min(0).max(100),

    // Social earning (per-package)
    socialEarningEnabled: z.boolean().optional(),
    socialEarningConfig: z
      .record(z.string(), z.number().int().min(0))
      .optional(),

    // Multipliers
    xpMultiplier: z.number().min(0.1).max(50),
    taskRewardMultiplier: z.number().min(0.1).max(50),
    socialEarningMultiplier: z.number().min(0.1).max(50),
    dailyReferralPoints: z.number().min(0),
    referralCommissionLevels: z.number().int().min(0).max(10),

    // Marketing
    features: z.array(z.string().max(120)).max(40).optional(),
    badgeColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .nullable(),
  })
  .strict();

/**
 * GET /api/admin/packages — list every Plan row.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "packages.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const packages = await prisma.package.findMany({
    orderBy: [{ order: "asc" }, { accessLevel: "asc" }],
  });
  return NextResponse.json({
    packages: packages.map((p) => ({
      ...p,
      priceMonthly: toNum(p.priceMonthly),
      priceYearly: toNumOrNull(p.priceYearly),
      minWithdrawal: toNum(p.minWithdrawal),
    })),
  });
}

/**
 * POST /api/admin/packages — create a new Plan.
 *
 * If `isDefault: true` is set, the request is wrapped in a transaction that
 * first clears `isDefault` from every other row, guaranteeing the
 * exactly-one-default invariant.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "packages.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PLAN_INPUT.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const existing = await prisma.package.findUnique({
    where: { slug: data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A plan with slug "${data.slug}" already exists` },
      { status: 409 }
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.package.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.package.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        accessLevel: data.accessLevel,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        order: data.order ?? 0,

        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly ?? null,
        validityDays: data.validityDays ?? null,

        tasksEnabled: data.tasksEnabled,
        socialFeedEnabled: data.socialFeedEnabled,
        referralsEnabled: data.referralsEnabled,
        withdrawalsEnabled: data.withdrawalsEnabled,
        marketplaceEnabled: data.marketplaceEnabled,
        boostEnabled: data.boostEnabled,
        dailyMissionEnabled: data.dailyMissionEnabled,
        lotteryEnabled: data.lotteryEnabled,
        coursesEnabled: data.coursesEnabled,
        advertiserEnabled: data.advertiserEnabled ?? true,
        gamesEnabled: data.gamesEnabled ?? true,
        adFree: data.adFree ?? false,

        createTasksEnabled: data.createTasksEnabled ?? false,
        sellCoursesEnabled: data.sellCoursesEnabled ?? false,
        sellMarketplaceEnabled: data.sellMarketplaceEnabled ?? false,
        agencyModeEnabled: data.agencyModeEnabled ?? false,
        shareLinksEnabled: data.shareLinksEnabled ?? false,
        shareYoutubeEnabled: data.shareYoutubeEnabled ?? false,

        socialTasksEnabled: data.socialTasksEnabled,
        proxyTasksEnabled: data.proxyTasksEnabled,
        articleTasksEnabled: data.articleTasksEnabled,
        videoTasksEnabled: data.videoTasksEnabled,
        quizTasksEnabled: data.quizTasksEnabled,
        surveyTasksEnabled: data.surveyTasksEnabled,
        offerwallTasksEnabled: data.offerwallTasksEnabled,
        appInstallEnabled: data.appInstallEnabled ?? true,

        dailyTaskLimit: data.dailyTaskLimit,
        dailyPostLimit: data.dailyPostLimit ?? -1,
        minWithdrawal: data.minWithdrawal,
        withdrawalFeeDiscount: data.withdrawalFeeDiscount,
        socialEarningEnabled: data.socialEarningEnabled ?? true,
        socialEarningConfig: data.socialEarningConfig ?? undefined,

        xpMultiplier: data.xpMultiplier,
        taskRewardMultiplier: data.taskRewardMultiplier,
        socialEarningMultiplier: data.socialEarningMultiplier,
        dailyReferralPoints: data.dailyReferralPoints,
        referralCommissionLevels: data.referralCommissionLevels,

        features: data.features ?? [],
        badgeColor: data.badgeColor ?? null,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PACKAGE_CREATED",
      entity: "Package",
      entityId: created.id,
      newData: { slug: created.slug, name: created.name, accessLevel: created.accessLevel },
    },
  });

  return NextResponse.json({ success: true, package: created });
}
