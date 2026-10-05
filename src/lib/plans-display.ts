import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { PACKAGES_TAG } from "@/lib/cache-tags";
import {
  COMPARE_ROWS,
  COMPARE_ROWS_SETTING,
  compareCell,
  planCanWithdraw,
  sanitizeCompareRows,
  type CompareCell,
  type CompareRowDef,
  type PlanCompareContext,
  type PlanForCompare,
} from "@/lib/plan-compare";

/**
 * The live plans, shaped for a plan card + comparison table. One loader for
 * /packages and the landing page, so the two can never quote different
 * prices. The plan list is in the data cache under PACKAGES_TAG (an admin
 * edit revalidates it); the settings come from getSetting's own cache.
 */

export interface PlanCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  isDefault: boolean;
  isPopular: boolean;
  icon: string | null;
  color: string | null;
  /** The plan's own selling points (admin-written). */
  bullets: string[];
  canWithdraw: boolean;
  cells: Record<string, CompareCell>;
}

const livePlans = unstable_cache(
  async () => {
    const rows = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { priceMonthly: "asc" }],
    });
    // Plain JSON for the cache: Decimals to numbers.
    return rows.map((p) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        o[k] = v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && "toFixed" in (v as object)
          ? Number(v)
          : v;
      }
      return o;
    });
  },
  ["plans-display:v1"],
  { revalidate: 300, tags: [PACKAGES_TAG] }
);

export async function getPlansForDisplay(): Promise<{
  plans: PlanCard[];
  rows: CompareRowDef[];
}> {
  const [raw, rowKeys, feePct, minW, allow, requiresSub] = await Promise.all([
    livePlans().catch(() => []),
    getSetting<unknown>(COMPARE_ROWS_SETTING, null).catch(() => null),
    getSetting<number>("withdrawal_fee_percent", 5).catch(() => 5),
    getSetting<number>("min_withdrawal", 5).catch(() => 5),
    getSetting<boolean>("allow_withdrawals", true).catch(() => true),
    getSetting<boolean>("withdrawal_requires_subscription", false).catch(() => false),
  ]);
  const ctx: PlanCompareContext = {
    withdrawalFeePct: Number(feePct) || 0,
    minWithdrawal: Number(minW) || 0,
    allowWithdrawals: allow !== false,
    withdrawalRequiresSubscription: requiresSub === true,
  };
  const keys = sanitizeCompareRows(rowKeys);
  const rows = keys
    .map((k) => COMPARE_ROWS.find((r) => r.key === k))
    .filter((r): r is CompareRowDef => !!r);

  const plans: PlanCard[] = raw.map((o) => {
    const p = o as unknown as PlanForCompare & {
      id: string; slug: string; name: string; description: string | null;
      priceYearly: number | null; isPopular?: boolean; icon?: string | null;
      badgeColor: string | null; features: string[];
    };
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceMonthly: Number(p.priceMonthly) || 0,
      priceYearly: p.priceYearly == null ? null : Number(p.priceYearly),
      isDefault: p.isDefault,
      isPopular: !!p.isPopular,
      icon: p.icon ?? null,
      color: p.badgeColor,
      bullets: (p.features ?? []).filter((b) => b.trim()),
      canWithdraw: planCanWithdraw(p, ctx),
      cells: Object.fromEntries(rows.map((r) => [r.key, compareCell(r.key, p, ctx)])),
    };
  });
  return { plans, rows };
}
