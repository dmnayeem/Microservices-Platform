import "server-only";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/**
 * Windowed ad revenue — the one place that answers "how much did ads earn
 * between these two dates".
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Every revenue figure on the platform used to read `AdCampaign.spentTotal`,
 * which is a LIFETIME counter with no date on it. So a date filter changed
 * every other number on the page and left ad revenue standing still — a
 * "September" report quoting the all-time total next to twelve windowed ones.
 *
 * `AdDailyStat` has the per-day figures (`@@unique([adId, date])`), so the
 * window is real here. Two things make it not a plain `sum(spendUsd)`:
 *
 *  1. **House ads.** A house campaign bills itself: `ad-events.ts` skips the
 *     charge, but rows written before that skip existed left roughly $1.95 of
 *     self-billing in `AdDailyStat.spendUsd`. It is money the platform "paid"
 *     itself and it is NOT revenue. `scripts/fix-house-campaign-spend.ts`
 *     cleared `AdCampaign.spentTotal` but never touched the daily rows.
 *  2. **Network ads.** ADSENSE and GAM are billed by Google, not by us; their
 *     earnings arrive in a Google report and never pass through this table.
 *     Counting the local spend column for them would invent revenue.
 *
 * That pair — `!campaign.isHouse && type !== "ADSENSE" && type !== "GAM"` — is
 * the exclusion the report and analytics panels already apply, written out by
 * hand in four places. `isNetworkAdType` and `adRevenueWindow` are now the one
 * definition; a fifth copy is how the figures start disagreeing.
 *
 * Historical rates are never re-derived: `spendUsd` is what was actually
 * billed, so a CPC change today does not rewrite last month's revenue.
 */

/** Billed by Google, not by us — its earnings are not in our tables at all. */
export function isNetworkAdType(type: string | null | undefined): boolean {
  return type === "ADSENSE" || type === "GAM";
}

export interface AdRevenueWindow {
  /** Real, billable ad revenue in the window, USD. */
  usd: number;
  /** Impressions and clicks behind that figure (earning inventory only). */
  impressions: number;
  clicks: number;
  /** Inventory that earned nothing here, kept separate rather than dropped. */
  houseImpressions: number;
  networkImpressions: number;
  /** Earning revenue per placement id — what each space is actually worth. */
  byPlacementId: Map<string, { usd: number; impressions: number; clicks: number }>;
  from: Date;
  to: Date;
}

/** Midnight UTC of a date — `AdDailyStat.date` is a `@db.Date` column. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Sum `AdDailyStat` over [from, to] inclusive, with the house/network gate.
 *
 * `AdDailyStat` carries no campaign or placement column, so the campaign and
 * placement come through the `ad` relation — which is also the only way to know
 * whether a row is house or network at all.
 */
export async function adRevenueWindow(
  from: Date,
  to: Date,
  /**
   * Finance only: advertisers whose campaigns are left out entirely (finance
   * test users). Omitted everywhere else, so the ad panels are unchanged.
   */
  opts: { excludeAdvertiserIds?: readonly string[] } = {}
): Promise<AdRevenueWindow> {
  const skipAdvertiser = new Set(opts.excludeAdvertiserIds ?? []);
  const start = utcDay(from);
  const end = utcDay(to);

  // Accelerate collapses a wide relational select to `{}` — restate the row.
  const rows = (await prisma.adDailyStat.findMany({
    where: { date: { gte: start, lte: end } },
    select: {
      impressions: true,
      clicks: true,
      spendUsd: true,
      ad: {
        select: {
          placementId: true,
          type: true,
          campaign: { select: { isHouse: true, advertiserId: true } },
        },
      },
    },
  })) as unknown as {
    impressions: number;
    clicks: number;
    spendUsd: number | string | null;
    ad: {
      placementId: string;
      type: string;
      campaign: { isHouse: boolean; advertiserId: string | null } | null;
    } | null;
  }[];

  const out: AdRevenueWindow = {
    usd: 0,
    impressions: 0,
    clicks: 0,
    houseImpressions: 0,
    networkImpressions: 0,
    byPlacementId: new Map(),
    from: start,
    to: end,
  };

  for (const r of rows) {
    const advertiserId = r.ad?.campaign?.advertiserId;
    if (advertiserId && skipAdvertiser.has(advertiserId)) continue;
    const house = !!r.ad?.campaign?.isHouse;
    const network = isNetworkAdType(r.ad?.type);
    if (house) out.houseImpressions += r.impressions;
    if (network) out.networkImpressions += r.impressions;
    if (house || network) continue;

    const usd = toNum(r.spendUsd);
    out.usd += usd;
    out.impressions += r.impressions;
    out.clicks += r.clicks;

    const pid = r.ad?.placementId;
    if (!pid) continue;
    const cur = out.byPlacementId.get(pid) ?? {
      usd: 0,
      impressions: 0,
      clicks: 0,
    };
    cur.usd += usd;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    out.byPlacementId.set(pid, cur);
  }

  // Rounded once, at the edge, so a column of these adds up to the total shown.
  out.usd = Math.round(out.usd * 1e6) / 1e6;
  for (const v of out.byPlacementId.values()) {
    v.usd = Math.round(v.usd * 1e6) / 1e6;
  }
  return out;
}

/** The trailing N days ending today (UTC), the window every ad panel uses. */
export async function adRevenueLastDays(days: number): Promise<AdRevenueWindow> {
  const today = utcDay(new Date());
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (Math.max(1, days) - 1));
  return adRevenueWindow(from, today);
}
