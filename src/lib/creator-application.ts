import { prisma } from "@/lib/prisma";
import {
  CreatorApplicationType,
  CreatorApplicationStatus,
  NotificationType,
  Prisma,
} from "@/generated/prisma";
import { parseFeatureOverrides, getEffectiveFeatures } from "@/lib/packages";
import type { PackageFeatureKey } from "@/lib/features";

interface CreatorTypeMeta {
  label: string;
  blurb: string;
  /** Feature flag that gates the dashboard (null for affiliate — uses affiliateJoinedAt). */
  gateFeature: PackageFeatureKey | null;
  /** Feature overrides set on approval. */
  grantFeatures: PackageFeatureKey[];
  dashboardHref: string;
}

/** Metadata for each application type — labels, the capability it grants, and where it leads. */
export const CREATOR_TYPES: Record<CreatorApplicationType, CreatorTypeMeta> = {
  MARKETPLACE_SELLER: {
    label: "Marketplace Seller",
    blurb: "Sell digital products, templates, and assets on the marketplace.",
    gateFeature: "sellMarketplace",
    grantFeatures: ["sellMarketplace"],
    dashboardHref: "/marketplace/create",
  },
  ADVERTISER: {
    label: "Advertiser — Run Ads",
    blurb: "Create ad campaigns, buy ad credit, and promote across the platform.",
    gateFeature: "advertiser",
    grantFeatures: ["advertiser"],
    dashboardHref: "/advertiser",
  },
  AGENCY: {
    label: "Promotion Agency",
    blurb: "Run promotions and manage ads + tasks at scale for clients.",
    gateFeature: "agencyMode",
    grantFeatures: ["agencyMode", "createTasks", "advertiser"],
    dashboardHref: "/agency",
  },
  SERVICE_PROVIDER: {
    label: "Service Provider",
    blurb: "Offer your skills as services (design, writing, video, marketing…) on the Services page and get paid per order.",
    gateFeature: "sellServices",
    grantFeatures: ["sellServices"],
    dashboardHref: "/services/create",
  },
  BLUE_BADGE: {
    label: "Blue Badge",
    blurb: "The blue checkmark next to your name. Apply and an admin reviews your profile and KYC.",
    gateFeature: null,
    // Granted on approval by setting the badge itself (see the admin review).
    grantFeatures: [],
    dashboardHref: "/profile",
  },
  DEALS: {
    label: "Escrow Deals",
    blurb: "Hire sellers through escrow deals — your money is held until the order is delivered.",
    gateFeature: "deals",
    grantFeatures: ["deals"],
    dashboardHref: "/marketplace/messages",
  },
  TASK_BUYER: {
    label: "Task Buyer",
    blurb:
      "Fund your own tasks: pay people on the platform to follow, share, or complete a job you set. You choose the reward and how many people.",
    gateFeature: "createTasks",
    // Deliberately NOT the AGENCY bundle. `createTasks` alone leaves a buyer
    // refused the moment they pick Social — the type most of them want — so
    // `socialTasks` comes with it. `agencyMode` and `advertiser` do not: an
    // agency console and an ad-campaign builder are not what someone asking to
    // buy 200 follows applied for.
    grantFeatures: ["createTasks", "socialTasks"],
    dashboardHref: "/create-task",
  },
  AFFILIATE: {
    label: "Affiliate",
    blurb: "Earn commissions by promoting products and courses with your link.",
    gateFeature: null,
    grantFeatures: [],
    dashboardHref: "/affiliate",
  },
};

export const CREATOR_TYPE_VALUES = Object.keys(
  CREATOR_TYPES
) as CreatorApplicationType[];

/** Does the user already effectively have this capability (plan / role / override / joined)? */
export async function hasCreatorAccess(
  userId: string,
  type: CreatorApplicationType
): Promise<boolean> {
  if (type === "AFFILIATE") {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { affiliateJoinedAt: true },
    });
    return !!u?.affiliateJoinedAt;
  }
  if (type === "BLUE_BADGE") {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBlueVerified: true, blueBadgeExpiresAt: true },
    });
    return !!u?.isBlueVerified && (!u.blueBadgeExpiresAt || u.blueBadgeExpiresAt > new Date());
  }
  const gate = CREATOR_TYPES[type].gateFeature;
  if (!gate) return false;
  const { enabled } = await getEffectiveFeatures(userId);
  return enabled.has(gate);
}

export interface CreatorApplicationInput {
  message: string;
  links?: string[];
  payload?: Prisma.InputJsonValue | null;
}

/** Create a PENDING application. Guards against duplicates + already-granted access. */
export async function createCreatorApplication(
  userId: string,
  type: CreatorApplicationType,
  input: CreatorApplicationInput
) {
  if (await hasCreatorAccess(userId, type)) {
    throw new Error("You already have this access.");
  }
  const existing = await prisma.creatorApplication.findFirst({
    where: { userId, type, status: CreatorApplicationStatus.PENDING },
  });
  if (existing) throw new Error("You already have a pending application for this.");

  return prisma.creatorApplication
    .create({
      data: {
        userId,
        type,
        message: input.message,
        links: input.links ?? [],
        payload: input.payload ?? Prisma.JsonNull,
      },
    })
    .catch((err: unknown) => {
      // Partial unique "one PENDING per user per type" — a double submit raced the check above.
      if ((err as { code?: string })?.code === "P2002") {
        throw new Error("You already have a pending application for this.");
      }
      throw err;
    });
}

/** Flip the User grant for a creator type (feature overrides, or affiliate join). */
export async function grantCreatorAccess(
  userId: string,
  type: CreatorApplicationType
) {
  const meta = CREATOR_TYPES[type];
  // The badge is granted with a reviewer-chosen duration (grantBlueBadge).
  if (type === "BLUE_BADGE") return;
  if (type === "AFFILIATE") {
    await prisma.user.updateMany({
      where: { id: userId, affiliateJoinedAt: null },
      data: { affiliateJoinedAt: new Date() },
    });
    return;
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureOverrides: true },
  });
  const fo = parseFeatureOverrides(u?.featureOverrides) as Partial<
    Record<PackageFeatureKey, boolean>
  >;
  for (const key of meta.grantFeatures) fo[key] = true;
  await prisma.user.update({
    where: { id: userId },
    data: { featureOverrides: fo as Prisma.InputJsonValue },
  });
}

/** Revoke a granted creator capability (delete overrides / clear affiliate join). */
export async function revokeCreatorAccess(
  userId: string,
  type: CreatorApplicationType
) {
  const meta = CREATOR_TYPES[type];
  if (type === "AFFILIATE") {
    await prisma.user.update({
      where: { id: userId },
      data: { affiliateJoinedAt: null },
    });
    return;
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { featureOverrides: true },
  });
  const fo = parseFeatureOverrides(u?.featureOverrides) as Partial<
    Record<PackageFeatureKey, boolean>
  >;
  for (const key of meta.grantFeatures) delete fo[key];
  await prisma.user.update({
    where: { id: userId },
    data: {
      featureOverrides: Object.keys(fo).length
        ? (fo as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

/** Approve a pending application: status→APPROVED, grant the capability, notify. */
export async function approveCreatorApplication(opts: {
  applicationId: string;
  reviewerId: string;
  adminNote?: string | null;
}) {
  const app = await prisma.creatorApplication.findUnique({
    where: { id: opts.applicationId },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== CreatorApplicationStatus.PENDING) {
    throw new Error(`Application is already ${app.status.toLowerCase()}`);
  }
  const meta = CREATOR_TYPES[app.type];

  // Compare-and-set on PENDING: two reviewers clicking at once must not both
  // grant (for the blue badge that would add the duration twice).
  const flipped = await prisma.creatorApplication.updateMany({
    where: { id: app.id, status: CreatorApplicationStatus.PENDING },
    data: {
      status: CreatorApplicationStatus.APPROVED,
      adminNote: opts.adminNote ?? null,
      reviewedById: opts.reviewerId,
      reviewedAt: new Date(),
    },
  });
  if (flipped.count === 0) throw new Error("Application was already reviewed");
  const updated = { ...app, status: CreatorApplicationStatus.APPROVED };

  await grantCreatorAccess(app.userId, app.type);

  await prisma.notification.create({
    data: {
      userId: app.userId,
      type: NotificationType.SYSTEM,
      title: `Approved: ${meta.label} 🎉`,
      message: `Your ${meta.label} application was approved. Open ${meta.dashboardHref} to get started.`,
      data: { applicationId: app.id },
    },
  });

  return updated;
}

/** Reject a pending application: status→REJECTED + note + notify. */
export async function rejectCreatorApplication(opts: {
  applicationId: string;
  reviewerId: string;
  adminNote?: string | null;
}) {
  const app = await prisma.creatorApplication.findUnique({
    where: { id: opts.applicationId },
  });
  if (!app) throw new Error("Application not found");
  if (app.status !== CreatorApplicationStatus.PENDING) {
    throw new Error(`Application is already ${app.status.toLowerCase()}`);
  }
  const meta = CREATOR_TYPES[app.type];
  const [updated] = await prisma.$transaction([
    prisma.creatorApplication.update({
      where: { id: app.id },
      data: {
        status: CreatorApplicationStatus.REJECTED,
        adminNote: opts.adminNote ?? null,
        reviewedById: opts.reviewerId,
        reviewedAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: app.userId,
        type: NotificationType.SYSTEM,
        title: `${meta.label} application update`,
        message: opts.adminNote
          ? `Your ${meta.label} application wasn't approved this time. Note: ${opts.adminNote}`
          : `Your ${meta.label} application wasn't approved this time. You can re-apply later.`,
        data: { applicationId: app.id },
      },
    }),
  ]);
  return updated;
}

/**
 * Give the blue badge for an approved BLUE_BADGE application — the same rule
 * as the admin user editor: lifetime (no end date) or N days from now (or from
 * the end of a badge still running). Auto-renew stays OFF so a free grant can
 * never turn into a charge when the hourly sweep reaches its end date.
 * Returns the audit entry for the caller to write.
 */
export async function grantBlueBadge(
  userId: string,
  opts: { lifetime: boolean; days: number | null }
): Promise<{ summary: string; meta: Record<string, unknown> }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isBlueVerified: true, blueBadgeExpiresAt: true, blueBadgeAutoRenew: true },
  });
  if (!u) throw new Error("User not found");
  const now = new Date();
  const base =
    u.isBlueVerified && u.blueBadgeExpiresAt && u.blueBadgeExpiresAt > now ? u.blueBadgeExpiresAt : now;
  const expiresAt = opts.lifetime ? null : new Date(base.getTime() + (opts.days ?? 0) * 86_400_000);
  await prisma.user.update({
    where: { id: userId },
    data: { isBlueVerified: true, blueBadgeExpiresAt: expiresAt, blueBadgeAutoRenew: false },
  });
  return {
    summary: expiresAt
      ? `Granted the blue badge until ${expiresAt.toISOString().slice(0, 10)} (application approved)`
      : "Granted the blue badge for life (application approved)",
    meta: {
      before: {
        isBlueVerified: u.isBlueVerified,
        blueBadgeExpiresAt: u.blueBadgeExpiresAt?.toISOString() ?? null,
        blueBadgeAutoRenew: u.blueBadgeAutoRenew,
      },
      after: { isBlueVerified: true, blueBadgeExpiresAt: expiresAt?.toISOString() ?? null, blueBadgeAutoRenew: false },
      lifetime: expiresAt === null,
      durationDays: opts.lifetime ? null : opts.days,
    },
  };
}
