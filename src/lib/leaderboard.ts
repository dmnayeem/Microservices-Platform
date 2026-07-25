import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { toNum } from "@/lib/money";

export type LeaderboardMetric =
  | "POINTS_EARNED"
  | "XP_EARNED"
  | "TASKS_COMPLETED"
  | "REFERRALS"
  | "COMBINED";

export interface CombinedRow {
  rank: number;
  userId: string;
  name: string | null;
  avatar: string | null;
  level: number;
  packageSlug: string;
  packageName: string | null;
  /** 0–100 unified score (avg percentile across 4 metrics). */
  score: number;
  /** Per-metric component values for display in the row. */
  components: {
    points: number;
    xp: number;
    tasks: number;
    team: number;
  };
  /** True only when this user's package is in the eligibility allowlist. */
  isEligible: boolean;
}

/** Default eligibility — any paid tier. Free users see their rank but
 *  can't claim prizes unless admin explicitly opts FREE in. */
export const DEFAULT_ELIGIBLE_PACKAGES = [
  "STARTER",
  "PRO",
  "ELITE",
  "VIP",
];

/** Read the admin-configured eligibility allowlist from SystemSetting.
 *  Returns the default if no override exists. */
export async function getEligiblePackages(): Promise<string[]> {
  // Read through the cached getSetting (was a raw findUnique per leaderboard req).
  const val = await getSetting<unknown>("lb_eligible_packages", null);
  if (Array.isArray(val)) {
    return (val as unknown[]).map((s) => String(s).toUpperCase());
  }
  return DEFAULT_ELIGIBLE_PACKAGES;
}

/** Compute the combined-score leaderboard. Mixes all 4 metrics into a single
 *  score by averaging each user's percentile across each metric, so wildly
 *  different scales (1M points vs 50 tasks) all weigh roughly equally. */
export async function computeCombinedTopUsers(options: {
  limit: number;
  eligiblePackages?: string[];
  /** When true, only eligible users are included (used during prize reset). */
  filterEligible?: boolean;
}): Promise<CombinedRow[]> {
  const limit = Math.max(1, Math.min(options.limit, 200));
  const eligiblePackages =
    options.eligiblePackages ?? (await getEligiblePackages());
  const eligibleSet = new Set(eligiblePackages.map((s) => s.toUpperCase()));

  // Pull a generous candidate pool. We pre-filter with totalEarnings DESC
  // (the most common headline metric) but rerank in JS using all 4 metrics.
  // 500 candidates × 4 metric values is a tiny working set.
  const POOL = 500;
  const usersRaw = await prisma.user.findMany({
    orderBy: { totalEarnings: "desc" },
    take: POOL,
    select: {
      id: true,
      name: true,
      avatar: true,
      level: true,
      totalEarnings: true,
      xp: true,
      package: { select: { slug: true, name: true } },
    },
  });

  type User = {
    id: string;
    name: string | null;
    avatar: string | null;
    level: number;
    totalEarnings: number;
    xp: number;
    package: { slug: string; name: string } | null;
  };
  const users = usersRaw as unknown as User[];
  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);

  // Tasks count and Referrals count (parallel)
  const [taskRowsRaw, referralRowsRaw] = await Promise.all([
    prisma.taskSubmission.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["referredById"],
      where: { referredById: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  // Prisma Accelerate's typing collapses groupBy results — cast to known shape.
  const taskRows = taskRowsRaw as unknown as Array<{
    userId: string;
    _count: { _all: number };
  }>;
  const referralRows = referralRowsRaw as unknown as Array<{
    referredById: string | null;
    _count: { _all: number };
  }>;

  const tasksByUser = new Map<string, number>();
  for (const r of taskRows) tasksByUser.set(r.userId, r._count._all);
  const teamByUser = new Map<string, number>();
  for (const r of referralRows) {
    if (r.referredById) teamByUser.set(r.referredById, r._count._all);
  }

  // Build per-user component row
  const rows = users.map((u) => ({
    user: u,
    // `totalEarnings` is a Decimal column masked as `number` by the cast above —
    // normalize to a real number for the percentile/score math below.
    points: toNum(u.totalEarnings),
    xp: u.xp,
    tasks: tasksByUser.get(u.id) ?? 0,
    team: teamByUser.get(u.id) ?? 0,
  }));

  // Percentile rank per metric (higher value = higher percentile).
  // Ties share the same percentile.
  function percentile(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return (v: number) => {
      if (sorted.length === 0) return 0;
      // Count of values <= v (handles ties by giving everyone their tier).
      let lo = 0,
        hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] <= v) lo = mid + 1;
        else hi = mid;
      }
      return Math.round((lo / sorted.length) * 100);
    };
  }

  const pPoints = percentile(rows.map((r) => r.points));
  const pXp = percentile(rows.map((r) => r.xp));
  const pTasks = percentile(rows.map((r) => r.tasks));
  const pTeam = percentile(rows.map((r) => r.team));

  // Combined score = average of 4 percentiles. 0–100 range.
  const scored = rows.map((r) => ({
    ...r,
    score:
      (pPoints(r.points) + pXp(r.xp) + pTasks(r.tasks) + pTeam(r.team)) / 4,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: more points wins
    return b.points - a.points;
  });

  const filtered = options.filterEligible
    ? scored.filter((r) =>
        r.user.package?.slug
          ? eligibleSet.has(r.user.package.slug.toUpperCase())
          : false
      )
    : scored;

  return filtered.slice(0, limit).map((r, idx) => ({
    rank: idx + 1,
    userId: r.user.id,
    name: r.user.name,
    avatar: r.user.avatar,
    level: r.user.level,
    packageSlug: r.user.package?.slug ?? "FREE",
    packageName: r.user.package?.name ?? null,
    score: Math.round(r.score * 10) / 10,
    components: {
      points: Math.round(r.points * 1000),
      xp: r.xp,
      tasks: r.tasks,
      team: r.team,
    },
    isEligible: r.user.package?.slug
      ? eligibleSet.has(r.user.package.slug.toUpperCase())
      : false,
  }));
}

/** Compute the combined rank of a specific user (used for "your rank" line). */
export async function computeCombinedUserRank(userId: string): Promise<{
  rank: number;
  score: number;
  isEligible: boolean;
  packageSlug: string;
  components: CombinedRow["components"];
} | null> {
  // Re-using the same algorithm. We compute over the candidate pool — if
  // the user isn't in the top 500 they get ranked at "500+".
  const top = await computeCombinedTopUsers({ limit: 500 });
  const idx = top.findIndex((r) => r.userId === userId);
  if (idx === -1) {
    // Fallback: still report their package + score as 0
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { package: { select: { slug: true } } },
    });
    const eligible = await getEligiblePackages();
    const slug = u?.package?.slug ?? "FREE";
    return {
      rank: 500 + 1,
      score: 0,
      isEligible: eligible.map((s) => s.toUpperCase()).includes(slug.toUpperCase()),
      packageSlug: slug,
      components: { points: 0, xp: 0, tasks: 0, team: 0 },
    };
  }
  const row = top[idx];
  return {
    rank: row.rank,
    score: row.score,
    isEligible: row.isEligible,
    packageSlug: row.packageSlug,
    components: row.components,
  };
}
