/**
 * Two selling rules an admin can switch on, and the money that flows from them.
 *
 *  1. **Licence tiers** — the same file sold at several prices depending on
 *     what the buyer may do with it. A blog post needs a standard licence; a
 *     product someone resells needs an extended one.
 *  2. **Payout hold** — the seller's share waits before it becomes spendable.
 *
 * The hold is the one worth explaining. Today a seller is paid the instant the
 * buyer clicks Buy, so a refund has to claw money back out of a balance they
 * may already have withdrawn: the clawback is clamped to whatever is left and
 * the remainder is quietly the platform's loss. Holding for a few days turns a
 * refund inside that window into reversing an untouched row.
 *
 * Both default OFF, and with them off nothing here changes any behaviour — no
 * tier is offered, no payout row is written, and the seller is credited exactly
 * as before. That matters more than usual: this file sits directly on the money
 * path of every marketplace sale.
 */
import { prisma } from "@/lib/prisma";
import {
  getSetting,
  invalidateSettingsCache,
  primeSetting,
} from "@/lib/system-settings";
import type { LedgerDb } from "@/lib/ledger";
import { D, toNum } from "@/lib/money";

/* ------------------------------------------------------------------ *
 * Licence tiers
 * ------------------------------------------------------------------ */

export type LicenseTier = {
  /** Stable id stored on the purchase. */
  id: string;
  name: string;
  /** Absolute price in USD, not a multiplier. */
  price: number;
  description?: string;
};

export const LICENSE_TIERS_KEY = "marketplace_license_tiers_enabled";

/** Offered in the seller form as a starting point; the seller edits freely. */
export const SUGGESTED_TIERS: LicenseTier[] = [
  {
    id: "standard",
    name: "Standard licence",
    price: 0,
    description: "Personal and commercial use in one end product. No resale.",
  },
  {
    id: "extended",
    name: "Extended licence",
    price: 0,
    description: "Unlimited end products, including items sold on to others.",
  },
];

export async function getLicenseTiersEnabled(): Promise<boolean> {
  return (await getSetting<boolean>(LICENSE_TIERS_KEY, false)) === true;
}

export async function setLicenseTiersEnabled(enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: LICENSE_TIERS_KEY },
    create: { key: LICENSE_TIERS_KEY, category: "marketplace", value: enabled },
    update: { category: "marketplace", value: enabled },
  });
  // Clearing the in-memory map is NOT enough on its own: the read carries an
  // Accelerate `cacheStrategy`, and that edge cache keeps serving the old row
  // for its TTL. Without priming, an admin flips the switch, the page reloads
  // showing the old state, and the feature looks broken. Verified — the
  // round-trip check failed on exactly this before priming was added.
  invalidateSettingsCache();
  primeSetting(LICENSE_TIERS_KEY, enabled);
}

const MAX_TIERS = 5;

/**
 * Normalise whatever arrived into tiers we are willing to store.
 *
 * Returns `[]` for anything unusable rather than throwing: a malformed tier
 * list must degrade to "this listing has a single price", never block a sale.
 */
export function sanitizeTiers(raw: unknown): LicenseTier[] {
  if (!Array.isArray(raw)) return [];
  const out: LicenseTier[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const id = String(t.id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 32);
    const name = String(t.name ?? "").trim().slice(0, 60);
    const price = Number(t.price);
    if (!id || !name || seen.has(id)) continue;
    if (!Number.isFinite(price) || price <= 0) continue;
    seen.add(id);
    out.push({
      id,
      name,
      price: Math.round(price * 100) / 100,
      description: t.description ? String(t.description).trim().slice(0, 300) : undefined,
    });
    if (out.length >= MAX_TIERS) break;
  }
  // Cheapest first, so the listing's headline price is the first tier.
  return out.sort((a, b) => a.price - b.price);
}

/** Tiers stored on a listing, ignoring anything malformed. */
export function readTiers(listingLicenseTiers: unknown): LicenseTier[] {
  return sanitizeTiers(listingLicenseTiers);
}

export type TierChoice =
  | { ok: true; tier: LicenseTier | null; price: number }
  | { ok: false; error: string };

/**
 * Work out what the buyer actually pays.
 *
 * `basePrice` wins whenever the listing has no usable tiers or the feature is
 * off, so switching the feature off mid-life cannot strand listings at a price
 * nobody can pay. A tier id that no longer exists is an error rather than a
 * silent fallback — the buyer chose a licence, and quietly selling them a
 * different one is not something to paper over.
 */
export function resolveTierPrice(
  basePrice: number,
  tiers: LicenseTier[],
  requestedTierId: string | null | undefined,
  tiersEnabled: boolean
): TierChoice {
  if (!tiersEnabled || tiers.length === 0) {
    return { ok: true, tier: null, price: basePrice };
  }
  if (!requestedTierId) {
    // Default to the cheapest, which is what the listing advertises.
    return { ok: true, tier: tiers[0], price: tiers[0].price };
  }
  const tier = tiers.find((t) => t.id === requestedTierId);
  if (!tier) {
    return { ok: false, error: "That licence is no longer offered on this listing." };
  }
  return { ok: true, tier, price: tier.price };
}

/* ------------------------------------------------------------------ *
 * Tax on the platform's commission
 * ------------------------------------------------------------------ */

export type MarketplaceTaxConfig = {
  enabled: boolean;
  /** Percent, applied to the commission — not to the sale. */
  pct: number;
  /** What the buyer sees on the receipt line. */
  label: string;
};

export const MARKETPLACE_TAX_KEY = "marketplace_commission_tax";

export const DEFAULT_MARKETPLACE_TAX: MarketplaceTaxConfig = {
  enabled: false,
  pct: 15,
  label: "VAT",
};

/**
 * Deliberately its own setting rather than reusing `vat_pct` (deposits) or
 * `billing.tax_pct` (ad invoices).
 *
 * Those tax different things at different moments — topping up a wallet, and
 * invoicing an advertiser — and an owner who changes one of them almost
 * certainly does not mean to silently change what every marketplace buyer is
 * charged. Sharing a key would make that impossible to avoid.
 */
export async function getMarketplaceTaxConfig(): Promise<MarketplaceTaxConfig> {
  const raw = await getSetting<Partial<MarketplaceTaxConfig>>(
    MARKETPLACE_TAX_KEY,
    DEFAULT_MARKETPLACE_TAX
  );
  const pct = Number(raw?.pct);
  return {
    enabled: raw?.enabled === true,
    pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : DEFAULT_MARKETPLACE_TAX.pct,
    label: String(raw?.label || DEFAULT_MARKETPLACE_TAX.label).slice(0, 20),
  };
}

export async function saveMarketplaceTaxConfig(cfg: MarketplaceTaxConfig): Promise<void> {
  const value = {
    enabled: cfg.enabled === true,
    pct: Math.min(100, Math.max(0, Number(cfg.pct) || 0)),
    label: String(cfg.label || "VAT").trim().slice(0, 20) || "VAT",
  };
  await prisma.systemSetting.upsert({
    where: { key: MARKETPLACE_TAX_KEY },
    create: { key: MARKETPLACE_TAX_KEY, category: "marketplace", value },
    update: { category: "marketplace", value },
  });
  invalidateSettingsCache();
  primeSetting(MARKETPLACE_TAX_KEY, value);
}

/**
 * Tax due on one sale, charged ON TOP of the price.
 *
 * The base is the platform's commission, not the sale: the taxable supply is
 * the service the platform provides, while the goods themselves are the
 * seller's own business and their own tax affair. So a $10 sale at 20%
 * commission and 15% tax costs the buyer $10.30 — the seller still receives
 * $8, and $0.30 is held for the tax authority.
 *
 * Rounded to whole cents, because that is what is actually charged and any
 * finer figure would never reconcile against the wallet.
 */
export function computeCommissionTax(
  commission: number,
  cfg: MarketplaceTaxConfig
): { tax: number; pct: number } {
  if (!cfg.enabled || !(commission > 0) || !(cfg.pct > 0)) {
    return { tax: 0, pct: 0 };
  }
  return {
    tax: Math.round(commission * (cfg.pct / 100) * 100) / 100,
    pct: cfg.pct,
  };
}

/* ------------------------------------------------------------------ *
 * Payout hold
 * ------------------------------------------------------------------ */

export type PayoutHoldConfig = {
  enabled: boolean;
  /** Days between the sale and the money becoming spendable. */
  days: number;
};

export const PAYOUT_HOLD_KEY = "marketplace_payout_hold";

export const DEFAULT_PAYOUT_HOLD: PayoutHoldConfig = { enabled: false, days: 7 };

export async function getPayoutHoldConfig(): Promise<PayoutHoldConfig> {
  const raw = await getSetting<Partial<PayoutHoldConfig>>(PAYOUT_HOLD_KEY, DEFAULT_PAYOUT_HOLD);
  const days = Number(raw?.days);
  return {
    enabled: raw?.enabled === true,
    // Clamped: a hold of 0 days pays instantly (so the switch would lie) and an
    // unbounded one is indistinguishable from never paying.
    days: Number.isFinite(days) ? Math.min(90, Math.max(1, Math.round(days))) : DEFAULT_PAYOUT_HOLD.days,
  };
}

export async function savePayoutHoldConfig(cfg: PayoutHoldConfig): Promise<void> {
  const value = {
    enabled: cfg.enabled === true,
    days: Math.min(90, Math.max(1, Math.round(Number(cfg.days) || DEFAULT_PAYOUT_HOLD.days))),
  };
  await prisma.systemSetting.upsert({
    where: { key: PAYOUT_HOLD_KEY },
    create: { key: PAYOUT_HOLD_KEY, category: "marketplace", value },
    update: { category: "marketplace", value },
  });
  // Same reason as above: the edge cache is not ours to clear, so hand the
  // fresh value to the instance the admin is actually talking to.
  invalidateSettingsCache();
  primeSetting(PAYOUT_HOLD_KEY, value);
}

/**
 * Pay the seller for one direct sale — now, or later.
 *
 * Call this INSIDE the sale's transaction, in place of crediting the seller
 * directly. With the hold off it does exactly what the old inline update did.
 * With it on it writes a HELD payout and credits nothing, leaving the release
 * to the `marketplace-payouts` sweep.
 *
 * `totalEarnings` moves with the money in both cases: it is a lifetime-earned
 * figure, and counting a sale that is still reversible would overstate it and
 * then need unwinding on refund.
 *
 * Escrow deals must NOT use this — `MarketplaceDeal` already holds the funds
 * through its own lifecycle, and holding twice pays the seller late for a sale
 * the buyer explicitly confirmed.
 */
export async function payOrHoldSeller(
  tx: LedgerDb,
  args: {
    sellerId: string;
    purchaseId: string;
    amount: number;
    hold: PayoutHoldConfig;
  }
): Promise<{ held: boolean; releaseAt: Date | null }> {
  const amount = toNum(args.amount);
  if (!(amount > 0)) return { held: false, releaseAt: null };

  if (!args.hold.enabled) {
    await tx.user.update({
      where: { id: args.sellerId },
      data: {
        cashBalance: { increment: D(amount) },
        totalEarnings: { increment: D(amount) },
      },
    });
    return { held: false, releaseAt: null };
  }

  const releaseAt = new Date(Date.now() + args.hold.days * 24 * 60 * 60 * 1000);
  await tx.marketplacePayout.create({
    data: {
      purchaseId: args.purchaseId,
      sellerId: args.sellerId,
      amount: D(amount),
      status: "HELD",
      releaseAt,
    },
  });
  return { held: true, releaseAt };
}
