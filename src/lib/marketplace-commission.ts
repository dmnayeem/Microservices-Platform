import { prisma } from "@/lib/prisma";
import {
  getSetting,
  invalidateSettingsCache,
  primeSetting,
} from "@/lib/system-settings";

/**
 * The admin-facing platform fee, as a PERCENT, on `/admin/settings` → Financial.
 *
 * One number, one key, read by every marketplace sale path. `orders/route.ts`
 * used to carry its own `const PLATFORM_FEE_PERCENT = 5`, so the box in the
 * admin form moved the fee on three checkout paths and not on the fourth.
 */
export const FEE_PERCENT_KEY = "marketplace.fee_percent";
export const DEFAULT_FEE_PERCENT = 5;

export interface CommissionRatesConfig {
  /** Default commission in basis points (1 bps = 0.01%). */
  default: number;
  /** Per-asset-type overrides keyed by assetType slug. */
  byAssetType?: Record<string, number>;
}

const SETTING_KEY = "marketplace_commission_rates";

export const DEFAULT_COMMISSION: CommissionRatesConfig = {
  default: 500, // 5%
  byAssetType: {},
};

/** The platform default fee in bps, from the ONE admin-editable percent key. */
async function defaultBps(): Promise<number> {
  const pct = Number(
    await getSetting<number>(FEE_PERCENT_KEY, DEFAULT_FEE_PERCENT)
  );
  if (!Number.isFinite(pct)) return DEFAULT_COMMISSION.default;
  return clampBps(Math.round(Math.max(0, Math.min(100, pct)) * 100));
}

/**
 * Read commission rate config from SystemSetting; falls back to DEFAULT.
 *
 * The DEFAULT rate comes from `marketplace.fee_percent` — not from the JSON
 * row — so the settings-form box and this advanced editor cannot disagree about
 * what the platform charges. The JSON row keeps only the per-asset-type
 * overrides, which have no scalar control.
 */
export async function getCommissionConfig(): Promise<CommissionRatesConfig> {
  const base = await defaultBps();
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  if (!row?.value || typeof row.value !== "object") {
    return { ...DEFAULT_COMMISSION, default: base };
  }
  const v = row.value as Partial<CommissionRatesConfig>;
  return {
    default: base,
    byAssetType:
      v.byAssetType && typeof v.byAssetType === "object"
        ? Object.fromEntries(
            Object.entries(v.byAssetType).map(([k, n]) => [
              k.toUpperCase(),
              clampBps(Number(n) || 0),
            ])
          )
        : {},
  };
}

/** Resolve the commission rate (bps) to apply for a particular listing.
 *  Precedence:
 *   1. `MarketplaceListing.commissionRateBps` per-listing override
 *   2. `byAssetType[assetType]` from settings
 *   3. `default` from settings (5% if unset) */
export async function resolveCommissionBps(opts: {
  assetType: string | null | undefined;
  perListingOverride: number | null | undefined;
}): Promise<number> {
  if (
    typeof opts.perListingOverride === "number" &&
    opts.perListingOverride >= 0
  ) {
    return clampBps(opts.perListingOverride);
  }
  const cfg = await getCommissionConfig();
  if (opts.assetType) {
    const byType = cfg.byAssetType?.[opts.assetType.toUpperCase()];
    if (typeof byType === "number") return clampBps(byType);
  }
  return clampBps(cfg.default);
}

/** Compute platform fee + seller amount from an accepted price + bps. */
export function splitPrice(amount: number, bps: number) {
  const safeBps = clampBps(bps);
  const fee = Math.round((amount * safeBps) / 10000 * 100) / 100;
  const sellerAmount = Math.round((amount - fee) * 100) / 100;
  return { fee, sellerAmount };
}

function clampBps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_COMMISSION.default;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

/** Persist a new commission config. Admin-only at the call site. */
export async function saveCommissionConfig(
  cfg: CommissionRatesConfig
): Promise<void> {
  // The default lands in the shared percent key, so the advanced editor and
  // the box on /admin/settings are literally the same setting.
  const bps = clampBps(cfg.default);
  await prisma.systemSetting.upsert({
    where: { key: FEE_PERCENT_KEY },
    create: {
      key: FEE_PERCENT_KEY,
      category: "financial",
      value: Math.round((bps / 100) * 100) / 100,
    },
    update: { category: "financial", value: Math.round((bps / 100) * 100) / 100 },
  });
  const payload: CommissionRatesConfig = {
    default: bps,
    byAssetType: cfg.byAssetType
      ? Object.fromEntries(
          Object.entries(cfg.byAssetType).map(([k, n]) => [
            k.toUpperCase(),
            clampBps(Number(n) || 0),
          ])
        )
      : {},
  };
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: {
      key: SETTING_KEY,
      category: "marketplace",
      value: payload as unknown as object,
    },
    update: {
      category: "marketplace",
      value: payload as unknown as object,
    },
  });
  // `getSetting` caches; without this the new fee applies only after the cache
  // expires, which reads to the admin as a box that did nothing.
  //
  // Clearing alone is still not enough: the read carries an Accelerate
  // `cacheStrategy`, and that edge cache keeps serving the old row (or, the
  // first time either key is written, the cached ABSENCE of it, which reads
  // as the default rate). Both keys are primed with exactly what was stored.
  invalidateSettingsCache();
  primeSetting(FEE_PERCENT_KEY, Math.round((bps / 100) * 100) / 100);
  primeSetting(SETTING_KEY, payload);
}
