import { usd } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma";

/**
 * Affiliate program helpers. A joined user shares a product/course link; when a
 * different buyer purchases through it (within the attribution window), the
 * affiliate earns the seller/tutor-set reward — paid OUT OF the seller/tutor's
 * cut (platform fee unchanged). Attribution is carried in an httpOnly cookie set
 * by /api/affiliate/click and read in the checkout/enroll transactions.
 */

export const AFFILIATE_COOKIE = "aff_attr";
export type AffiliateTarget = "MARKETPLACE" | "COURSE";

export interface AffiliateAttribution {
  aff: string; // affiliate userId
  t: AffiliateTarget;
  id: string; // target listing/course id
  ts: number; // epoch ms when set
}

export interface AffiliateConfig {
  enabled: boolean;
  cookieWindowDays: number;
  /** When true, joining requires an approved CreatorApplication (not self-serve). */
  requireApproval: boolean;
}

const SETTING_KEY = "affiliate_config";
const DEFAULT_CONFIG: AffiliateConfig = {
  enabled: true,
  cookieWindowDays: 30,
  requireApproval: true,
};

export async function getAffiliateConfig(): Promise<AffiliateConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  const v = (row?.value ?? null) as Partial<AffiliateConfig> | null;
  if (!v || typeof v !== "object") return DEFAULT_CONFIG;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_CONFIG.enabled,
    cookieWindowDays:
      typeof v.cookieWindowDays === "number" && v.cookieWindowDays > 0
        ? Math.min(365, Math.round(v.cookieWindowDays))
        : DEFAULT_CONFIG.cookieWindowDays,
    requireApproval:
      typeof v.requireApproval === "boolean"
        ? v.requireApproval
        : DEFAULT_CONFIG.requireApproval,
  };
}

/** True when a seller/tutor has configured a usable affiliate reward. */
export function isAffiliateEligible(
  type: string | null | undefined,
  value: number | null | undefined
): boolean {
  return (type === "PERCENT" || type === "FIXED") && !!value && value > 0;
}

/** Human display of the affiliate reward ("12%" / "$5.00"), or null when not
 *  eligible. Shown ONLY to approved affiliates (gated by the caller). */
export function formatAffiliateReward(
  type: string | null | undefined,
  value: number | null | undefined
): string | null {
  if (!isAffiliateEligible(type, value)) return null;
  const v = Number(value);
  if (type === "PERCENT") return `${v % 1 === 0 ? v : v.toFixed(1)}%`;
  return `${usd(v)}`;
}

/**
 * Reward the affiliate earns on a sale, capped so it never exceeds what the
 * seller/tutor would otherwise net (the reward is deducted from their cut).
 * Returns a non-negative amount rounded to cents.
 */
export function computeAffiliateCommission(
  type: string | null | undefined,
  value: number | null | undefined,
  saleAmount: number,
  sellerNet: number
): number {
  if (!isAffiliateEligible(type, value)) return 0;
  const raw =
    type === "PERCENT" ? (saleAmount * (value as number)) / 100 : (value as number);
  const capped = Math.max(0, Math.min(raw, sellerNet));
  return Math.round(capped * 100) / 100;
}

/** Serialize an attribution for the cookie value. */
export function serializeAttribution(a: AffiliateAttribution): string {
  return JSON.stringify(a);
}

/**
 * Parse + validate the attribution cookie. Returns null when malformed, for the
 * wrong target, or older than the window. Caller still checks buyer ≠ affiliate.
 */
export function parseAttribution(
  raw: string | undefined,
  target: AffiliateTarget,
  targetId: string,
  windowDays: number,
  now: number
): AffiliateAttribution | null {
  if (!raw) return null;
  let a: AffiliateAttribution;
  try {
    a = JSON.parse(raw) as AffiliateAttribution;
  } catch {
    return null;
  }
  if (!a || a.t !== target || a.id !== targetId || !a.aff) return null;
  if (typeof a.ts !== "number") return null;
  if (now - a.ts > windowDays * 24 * 60 * 60 * 1000) return null;
  return a;
}

/**
 * Reverse an affiliate commission when the underlying sale is refunded. Debits
 * the affiliate's cash (clamped to their available balance — never negative)
 * and writes a reversing ledger row. Idempotent per (sourceType, orderRef) via
 * the reversal reference. Best-effort — never throws into the refund flow.
 */
export async function reverseAffiliateCommission(
  sourceType: AffiliateTarget,
  orderRef: string
): Promise<void> {
  try {
    const comm = await prisma.affiliateCommission.findUnique({
      where: { sourceType_orderRef: { sourceType, orderRef } },
      select: { affiliateUserId: true, commissionAmount: true },
    });
    if (!comm) return;
    const ref = `affiliate_reversal_${sourceType}_${orderRef}`;
    const already = await prisma.transaction.findFirst({
      where: { userId: comm.affiliateUserId, reference: ref },
      select: { id: true },
    });
    if (already) return; // already reversed

    const amount = Number(comm.commissionAmount);
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: comm.affiliateUserId },
        select: { cashBalance: true },
      });
      const bal = Number(u?.cashBalance ?? 0);
      const debit = Math.min(bal, amount); // clamp — no negative balance
      if (debit > 0) {
        await tx.user.update({
          where: { id: comm.affiliateUserId },
          data: { cashBalance: { decrement: debit } },
        });
      }
      await tx.transaction.create({
        data: {
          userId: comm.affiliateUserId,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          points: 0,
          // The amount actually clawed back, not the full commission. The
          // debit above is clamped to the balance so it can't go negative;
          // writing `-amount` here regardless meant the ledger and the balance
          // disagreed permanently by whatever couldn't be recovered, and a
          // reconciliation would never find where it went. `shortfall` records
          // the gap explicitly instead of hiding it.
          amount: -debit,
          description: "Affiliate commission reversed (sale refunded)",
          reference: ref,
          metadata: {
            sourceType,
            orderRef,
            commissionAmount: amount,
            clawedBack: debit,
            shortfall: amount - debit,
          },
        },
      });
    });
  } catch (err) {
    console.error("affiliate reversal failed:", err);
  }
}
