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
  /** Method charge (personal) in local currency. */
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
  vatEnabled: boolean;
  vatPct: number;
}): DepositBreakdown {
  const amountUsd = Math.max(0, Number(opts.amountUsd) || 0);
  const currency = opts.currency;
  const rate = currency?.usdRate ?? 0;
  const localBase = amountUsd * rate;
  const charge = localBase * (Math.max(0, opts.chargePct) / 100);
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
