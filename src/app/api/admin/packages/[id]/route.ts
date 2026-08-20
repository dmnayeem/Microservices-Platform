import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { PACKAGES_TAG } from "@/lib/cache-tags";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT — every field optional so admin can patch one switch at a time.
const PLAN_PATCH = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional().nullable(),
    accessLevel: z.number().int().min(0).max(1000).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),

    priceMonthly: z.number().min(0).optional(),
    priceYearly: z.number().min(0).optional().nullable(),
    validityDays: z.number().int().min(0).optional().nullable(),

    tasksEnabled: z.boolean().optional(),
    socialFeedEnabled: z.boolean().optional(),
    referralsEnabled: z.boolean().optional(),
    withdrawalsEnabled: z.boolean().optional(),
    marketplaceEnabled: z.boolean().optional(),
    boostEnabled: z.boolean().optional(),
    dailyMissionEnabled: z.boolean().optional(),
    lotteryEnabled: z.boolean().optional(),
    coursesEnabled: z.boolean().optional(),
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
    targetTasksEnabled: z.boolean().optional(),

    socialTasksEnabled: z.boolean().optional(),
    proxyTasksEnabled: z.boolean().optional(),
    articleTasksEnabled: z.boolean().optional(),
    videoTasksEnabled: z.boolean().optional(),
    quizTasksEnabled: z.boolean().optional(),
    surveyTasksEnabled: z.boolean().optional(),
    offerwallTasksEnabled: z.boolean().optional(),
    appInstallEnabled: z.boolean().optional(),

    dailyTaskLimit: z.number().int().min(-1).max(100000).optional(),
    dailyPostLimit: z.number().int().min(-1).max(100000).optional(),
    minWithdrawal: z.number().min(0).optional(),
    withdrawalFeeDiscount: z.number().min(0).max(100).optional(),

    socialEarningEnabled: z.boolean().optional(),
    socialEarningConfig: z
      .record(z.string(), z.number().int().min(0))
      .optional(),

    xpMultiplier: z.number().min(0.1).max(50).optional(),
    taskRewardMultiplier: z.number().min(0.1).max(50).optional(),
    socialEarningMultiplier: z.number().min(0.1).max(50).optional(),
    dailyReferralPoints: z.number().min(0).optional(),
    referralCommissionLevels: z.number().int().min(0).max(10).optional(),

    features: z.array(z.string().max(120)).max(40).optional(),
    badgeColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .nullable(),
  })
  .strict();

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "packages.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const userCount = await prisma.user.count({ where: { packageId: id } });
  return NextResponse.json({ package: pkg, userCount });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "packages.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.package.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PLAN_PATCH.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Default plan is system-protected — must always be active and remain default.
  if (existing.isDefault) {
    if (data.isActive === false) {
      return NextResponse.json(
        { error: "The default plan cannot be deactivated" },
        { status: 400 }
      );
    }
    if (data.isDefault === false) {
      return NextResponse.json(
        {
          error:
            "Cannot un-set the default plan. Mark another plan as default first.",
        },
        { status: 400 }
      );
    }
  }

  // Slug uniqueness — refuse to clobber another row.
  if (data.slug && data.slug !== existing.slug) {
    const collide = await prisma.package.findUnique({
      where: { slug: data.slug },
    });
    if (collide) {
      return NextResponse.json(
        { error: `Slug "${data.slug}" already in use` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Promoting another plan to default — clear the existing default first.
    if (data.isDefault === true && !existing.isDefault) {
      await tx.package.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.package.update({ where: { id }, data });
  });

  // The pricing table is cached behind PACKAGES_TAG — purge it so an admin
  // price change is visible immediately rather than after a TTL. A stale price
  // means a user quoted one amount and charged another.
  revalidateTag(PACKAGES_TAG, "max");

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PACKAGE_UPDATED",
      entity: "Package",
      entityId: id,
      newData: { changedKeys: Object.keys(data) },
    },
  });

  return NextResponse.json({ success: true, package: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "packages.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  if (pkg.isDefault) {
    return NextResponse.json(
      { error: "The default plan cannot be deleted" },
      { status: 400 }
    );
  }

  // Block delete while users are still attached. Admin must reassign first.
  const userCount = await prisma.user.count({ where: { packageId: id } });
  if (userCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${userCount} user(s) are on this plan. Move them to another plan first.`,
      },
      { status: 400 }
    );
  }

  await prisma.package.delete({ where: { id } });

  // The pricing table is cached behind PACKAGES_TAG — purge it so an admin
  // price change is visible immediately rather than after a TTL. A stale price
  // means a user quoted one amount and charged another.
  revalidateTag(PACKAGES_TAG, "max");

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PACKAGE_DELETED",
      entity: "Package",
      entityId: id,
      newData: { slug: pkg.slug, name: pkg.name },
    },
  });

  return NextResponse.json({ success: true });
}
