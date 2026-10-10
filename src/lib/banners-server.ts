import "server-only";
import { prisma } from "@/lib/prisma";
import type { Banner, BannerLocation } from "@/generated/prisma/client";
import { bannerMatches, type BannerViewer } from "@/lib/banner-audience";
import { currentDevice } from "@/lib/device-current";
import { getEffectivePackage } from "@/lib/packages";
import { matchesExtraAudience, needsPlan } from "@/lib/audience-extra";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";

/**
 * The banners one person sees at one place — the single rule for every page
 * that shows banners: active, inside its dates, at this location (or ALL), and
 * matching the person (area / gender / age, KYC, device, plan, level, account
 * age). The Earn hub, Marketplace and Dashboard locations could be chosen in
 * the admin but no page ever showed them; they use this now.
 */

export async function activeBannersAt(locations: BannerLocation[]): Promise<Banner[]> {
  const now = new Date();
  return prisma.banner.findMany({
    where: {
      isActive: true,
      location: { in: locations },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { order: "asc" },
    take: 60,
    cacheStrategy: { ttl: 300, swr: 600 },
  });
}

/** Keep the banners this signed-in person may see. `me` may be passed if already loaded. */
export async function filterBannersForViewer<T extends Banner>(
  rows: T[],
  userId: string,
  me?: (BannerViewer & { level?: number | null; createdAt?: Date | null }) | null
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const viewer =
    me && "level" in me && "createdAt" in me
      ? me
      : await prisma.user
          .findUnique({
            where: { id: userId },
            select: { ...TASK_VIEWER_SELECT, kycStatus: true, createdAt: true },
          })
          .catch(() => null);
  const [device, pkg] = await Promise.all([
    currentDevice(),
    rows.some((b) => needsPlan(b)) ? getEffectivePackage(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const extra = {
    plan: pkg ? { id: pkg.id, paid: !pkg.isDefault && (pkg.priceMonthly > 0 || (pkg.priceYearly ?? 0) > 0) } : null,
    level: viewer?.level ?? null,
    joinedAt: viewer?.createdAt ? new Date(viewer.createdAt).getTime() : null,
  };
  return rows.filter(
    (b) => bannerMatches(b, { ...(viewer ?? {}), device }) && matchesExtraAudience(b, extra)
  );
}

export async function bannersFor(userId: string, location: BannerLocation): Promise<Banner[]> {
  const rows = await activeBannersAt([location, "ALL"]).catch(() => [] as Banner[]);
  return filterBannersForViewer(rows, userId);
}
