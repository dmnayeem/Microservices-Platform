import type { Currency } from "@/lib/currencies";

/** Effective charge % for a deposit method (0 unless it's a personal charge).
 *  Pure + client-safe (kept out of deposit-methods.ts, which imports prisma). */
export function effectiveChargePct(m: {
  chargePct?: number;
  chargeType?: string;
}): number {
  return m.chargeType === "personal" ? Math.max(0, Number(m.chargePct) || 0) : 0;
}

/**
 * Compute the local-currency breakdown for a deposit. Pure (client + server
 * safe). The wallet is credited `amountUsd`; the method charge + VAT are added
 * on top as what the user actually pays in their local currency.
 */
export interface DepositBreakdown {
  amountUsd: number;
  /** amountUsd × currency.usdRate (0 when no currency configured). */
  localBase: number;
  /** Method charge (percentage + flat) in local currency. */
  charge: number;
  /** VAT in local currency (0 when disabled). */
  vat: number;
  /** localBase + charge + vat. */
  totalLocal: number;
  currency: Currency | null;
}

export function computeDepositBreakdown(opts: {
  amountUsd: number;
  currency: Currency | null;
  chargePct: number;
  /**
   * A fixed charge in USD — a crypto network fee, which costs the same whether
   * the transfer is $5 or $5,000. Quoted in USD and converted here, because
   * that is the currency the chain actually charges in; expressing it in the
   * user's local currency would drift every time the rate moved.
   */
  feeFlatUsd?: number;
  vatEnabled: boolean;
  vatPct: number;
}): DepositBreakdown {
  const amountUsd = Math.max(0, Number(opts.amountUsd) || 0);
  const currency = opts.currency;
  const rate = currency?.usdRate ?? 0;
  const localBase = amountUsd * rate;
  const flatLocal = Math.max(0, Number(opts.feeFlatUsd) || 0) * rate;
  // Both charges sit in the same line, and VAT applies to the total of them,
  // exactly as it already did for the percentage alone.
  const charge = localBase * (Math.max(0, opts.chargePct) / 100) + flatLocal;
  const vat = opts.vatEnabled
    ? (localBase + charge) * (Math.max(0, opts.vatPct) / 100)
    : 0;
  return {
    amountUsd,
    localBase,
    charge,
    vat,
    totalLocal: localBase + charge + vat,
    currency,
  };
}

/** Format a local-currency amount with the currency's symbol (thousands-grouped). */
export function formatLocal(amount: number, currency: Currency | null): string {
  if (!currency) return "";
  const n = Math.round(amount);
  return `${currency.symbol}${n.toLocaleString("en-US")}`;
}
