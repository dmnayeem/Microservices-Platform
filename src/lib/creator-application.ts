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

  return prisma.creatorApplication.create({
    data: {
      userId,
      type,
      message: input.message,
      links: input.links ?? [],
      payload: input.payload ?? Prisma.JsonNull,
    },
  });
}

/** Flip the User grant for a creator type (feature overrides, or affiliate join). */
export async function grantCreatorAccess(
  userId: string,
  type: CreatorApplicationType
) {
  const meta = CREATOR_TYPES[type];
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

  const updated = await prisma.creatorApplication.update({
    where: { id: app.id },
    data: {
      status: CreatorApplicationStatus.APPROVED,
      adminNote: opts.adminNote ?? null,
      reviewedById: opts.reviewerId,
      reviewedAt: new Date(),
    },
  });

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
