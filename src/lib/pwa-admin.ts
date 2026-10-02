import "server-only";
import { prisma } from "@/lib/prisma";
import { NON_STAFF_WHERE } from "@/lib/staff";
import { utcDay } from "@/lib/active-days";
import { PWA_PLATFORMS, type PwaPlatform } from "@/lib/pwa-shared";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Reads for /admin/users/app-installs and its CSV export. Staff are left out
 * everywhere — their installs are testing, not adoption.
 */

export const LEGACY_PWA_HOST = "www.revtype.com";

export interface PwaInstallFilters {
  status: "installed" | "not" | "all";
  platform: PwaPlatform | "";
  /** YYYY-MM-DD, inclusive. Install date for installed users, join date otherwise. */
  from: string;
  to: string;
  q: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parsePwaInstallFilters(p: Record<string, string | undefined>): PwaInstallFilters {
  const status = p.status === "not" || p.status === "all" ? p.status : "installed";
  const platform = (PWA_PLATFORMS as string[]).includes(p.platform ?? "") ? (p.platform as PwaPlatform) : "";
  return {
    status,
    platform,
    from: ISO_DAY.test(p.from ?? "") ? p.from! : "",
    to: ISO_DAY.test(p.to ?? "") ? p.to! : "",
    q: (p.q ?? "").trim().slice(0, 100),
  };
}

export function pwaInstallWhere(f: PwaInstallFilters): Prisma.UserWhereInput {
  const range: Prisma.DateTimeNullableFilter = {};
  if (f.from) range.gte = new Date(`${f.from}T00:00:00.000Z`);
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  const hasRange = !!(f.from || f.to);
  const and: Prisma.UserWhereInput[] = [NON_STAFF_WHERE as Prisma.UserWhereInput];

  if (f.status === "installed") {
    and.push({ pwaFirstSeenAt: hasRange ? { not: null, ...range } : { not: null } });
  } else if (f.status === "not") {
    and.push({ pwaFirstSeenAt: null });
    if (hasRange) and.push({ createdAt: range as Prisma.DateTimeFilter });
  } else if (hasRange) {
    and.push({ createdAt: range as Prisma.DateTimeFilter });
  }
  if (f.platform && f.status !== "not") and.push({ pwaPlatform: f.platform });
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { email: { contains: f.q, mode: "insensitive" } },
        { username: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

export const PWA_ROW_SELECT = {
  id: true,
  name: true,
  email: true,
  username: true,
  createdAt: true,
  status: true,
  pwaFirstSeenAt: true,
  pwaLastSeenAt: true,
  pwaPlatform: true,
  pwaDays: true,
  pwaRewardedAt: true,
  pwaHost: true,
} as const;

export async function pwaInstallStats() {
  const installed = { ...NON_STAFF_WHERE, pwaFirstSeenAt: { not: null } } as Prisma.UserWhereInput;
  const active30 = { ...NON_STAFF_WHERE, activeDays: { some: { date: { gte: utcDay(29) } } } } as Prisma.UserWhereInput;
  const [total, last7, last30, activeUsers, activeInstalled, byPlatform, rewarded, legacyWww, paid] =
    await Promise.all([
      prisma.user.count({ where: installed }),
      prisma.user.count({ where: { ...NON_STAFF_WHERE, pwaFirstSeenAt: { gte: utcDay(6) } } as Prisma.UserWhereInput }),
      prisma.user.count({ where: { ...NON_STAFF_WHERE, pwaFirstSeenAt: { gte: utcDay(29) } } as Prisma.UserWhereInput }),
      prisma.user.count({ where: active30 }),
      prisma.user.count({ where: { AND: [active30, { pwaFirstSeenAt: { not: null } }] } }),
      prisma.user.groupBy({ by: ["pwaPlatform"], where: installed, _count: { _all: true } }),
      prisma.user.count({ where: { ...NON_STAFF_WHERE, pwaRewardedAt: { not: null } } as Prisma.UserWhereInput }),
      prisma.user.count({ where: { ...NON_STAFF_WHERE, pwaHost: LEGACY_PWA_HOST } as Prisma.UserWhereInput }),
      // Points column, never `amount` (its sign is not consistent across writers).
      prisma.transaction.aggregate({
        where: { reference: { startsWith: "pwa_install_" } },
        _sum: { points: true },
      }),
    ]);
  const platforms = Object.fromEntries(PWA_PLATFORMS.map((p) => [p, 0])) as Record<PwaPlatform, number>;
  for (const g of byPlatform as unknown as Array<{ pwaPlatform: string | null; _count: { _all: number } }>) {
    const k = (PWA_PLATFORMS as string[]).includes(g.pwaPlatform ?? "") ? (g.pwaPlatform as PwaPlatform) : "other";
    platforms[k] += g._count._all;
  }
  return {
    total,
    last7,
    last30,
    activeUsers,
    activeInstalled,
    activePct: activeUsers > 0 ? (activeInstalled / activeUsers) * 100 : 0,
    platforms,
    rewarded,
    pointsPaid: Number(paid._sum.points ?? 0),
    legacyWww,
  };
}
