import "server-only";
import { prisma } from "@/lib/prisma";
import { NON_STAFF_WHERE, STAFF_ROLES } from "@/lib/staff";
import { utcDay } from "@/lib/active-days";
import { PWA_PLATFORMS, type PwaPlatform } from "@/lib/pwa-shared";
import { Prisma } from "@/generated/prisma/client";

/**
 * Reads for /admin/users/app-installs and its CSV export. Staff are left out
 * everywhere — their installs are testing, not adoption.
 */

export const LEGACY_PWA_HOST = "www.revtype.com";

/**
 * installed   — has the app now (seen installed, no uninstall signal since)
 * dormant     — has it, but hasn't opened it in 30+ days (on iOS the only
 *               sign of a removal: Safari never says)
 * uninstalled — removed it (a browser on the same platform offered "Install
 *               app" again; cleared if they open it installed later)
 * not         — never installed
 * all         — everyone
 */
export const PWA_STATUSES = ["installed", "dormant", "uninstalled", "not", "all"] as const;
export type PwaStatus = (typeof PWA_STATUSES)[number];
export const DORMANT_DAYS = 30;

export interface PwaInstallFilters {
  status: PwaStatus;
  platform: PwaPlatform | "";
  /** YYYY-MM-DD, inclusive. Install date for installed users, join date otherwise. */
  from: string;
  to: string;
  q: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parsePwaInstallFilters(p: Record<string, string | undefined>): PwaInstallFilters {
  const status = (PWA_STATUSES as readonly string[]).includes(p.status ?? "") ? (p.status as PwaStatus) : "installed";
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

  const dormantBefore = utcDay(DORMANT_DAYS - 1);
  if (f.status === "installed" || f.status === "dormant" || f.status === "uninstalled") {
    and.push({ pwaFirstSeenAt: hasRange ? { not: null, ...range } : { not: null } });
    if (f.status === "uninstalled") and.push({ pwaUninstalledAt: { not: null } });
    else and.push({ pwaUninstalledAt: null });
    if (f.status === "dormant") {
      and.push({ OR: [{ pwaLastSeenAt: null }, { pwaLastSeenAt: { lt: dormantBefore } }] });
    }
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
  pwaUninstalledAt: true,
} as const;

/**
 * Every summary figure in ONE query (plus the points sum). The page used to
 * send twelve counts at once; one of them failing now and then is what made
 * /admin/users/app-installs error until it was reloaded (owner, 2026-10-16).
 * Same definitions as the counts it replaces — checked against them live.
 */
export async function pwaInstallStatsOneQuery() {
  const staff = Prisma.join(STAFF_ROLES.map((r) => String(r)));
  const d6 = utcDay(6);
  const d29 = utcDay(29);
  const dormantBefore = utcDay(DORMANT_DAYS - 1);
  const [[r], byPlatform, paid] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, number>>>`
      SELECT
        COUNT(*) FILTER (WHERE u."pwaFirstSeenAt" IS NOT NULL)::int AS total,
        COUNT(*) FILTER (WHERE u."pwaFirstSeenAt" >= ${d6})::int AS last7,
        COUNT(*) FILTER (WHERE u."pwaFirstSeenAt" >= ${d29})::int AS last30,
        COUNT(*) FILTER (WHERE a.active)::int AS "activeUsers",
        COUNT(*) FILTER (WHERE a.active AND u."pwaFirstSeenAt" IS NOT NULL)::int AS "activeInstalled",
        COUNT(*) FILTER (WHERE u."pwaRewardedAt" IS NOT NULL)::int AS rewarded,
        COUNT(*) FILTER (WHERE u."pwaHost" = ${LEGACY_PWA_HOST})::int AS "legacyWww",
        COUNT(*) FILTER (WHERE u."pwaFirstSeenAt" IS NOT NULL AND u."pwaUninstalledAt" IS NOT NULL)::int AS uninstalled,
        COUNT(*) FILTER (WHERE u."pwaFirstSeenAt" IS NOT NULL AND u."pwaUninstalledAt" IS NULL
                           AND (u."pwaLastSeenAt" IS NULL OR u."pwaLastSeenAt" < ${dormantBefore}))::int AS dormant,
        COUNT(*)::int AS everyone
      FROM "User" u
      CROSS JOIN LATERAL (
        SELECT EXISTS (SELECT 1 FROM "UserActiveDay" d WHERE d."userId" = u.id AND d.date >= ${d29}::date) AS active
      ) a
      WHERE u.role::text NOT IN (${staff})`,
    prisma.$queryRaw<Array<{ p: string | null; n: number }>>`
      SELECT u."pwaPlatform" AS p, COUNT(*)::int AS n FROM "User" u
      WHERE u.role::text NOT IN (${staff}) AND u."pwaFirstSeenAt" IS NOT NULL
      GROUP BY 1`,
    prisma.transaction.aggregate({
      where: { reference: { startsWith: "pwa_install_" } },
      _sum: { points: true },
    }),
  ]);
  const platforms = Object.fromEntries(PWA_PLATFORMS.map((p) => [p, 0])) as Record<PwaPlatform, number>;
  for (const g of byPlatform) {
    const k = (PWA_PLATFORMS as string[]).includes(g.p ?? "") ? (g.p as PwaPlatform) : "other";
    platforms[k] += g.n;
  }
  return {
    total: r.total,
    installedNow: r.total - r.uninstalled,
    uninstalled: r.uninstalled,
    dormant: r.dormant,
    notInstalled: Math.max(0, r.everyone - r.total),
    everyone: r.everyone,
    last7: r.last7,
    last30: r.last30,
    activeUsers: r.activeUsers,
    activeInstalled: r.activeInstalled,
    activePct: r.activeUsers > 0 ? (r.activeInstalled / r.activeUsers) * 100 : 0,
    platforms,
    rewarded: r.rewarded,
    pointsPaid: Number(paid._sum.points ?? 0),
    legacyWww: r.legacyWww,
  };
}

export async function pwaInstallStats() {
  // One retry: a single failed read must not turn the whole page into an error.
  try {
    return await pwaInstallStatsOneQuery();
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return pwaInstallStatsOneQuery();
  }
}
