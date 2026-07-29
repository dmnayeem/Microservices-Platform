import { prisma } from "@/lib/prisma";

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

interface AffiliateConfig {
  enabled: boolean;
  cookieWindowDays: number;
}

const SETTING_KEY = "affiliate_config";
const DEFAULT_CONFIG: AffiliateConfig = { enabled: true, cookieWindowDays: 30 };

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
  };
}

/** True when a seller/tutor has configured a usable affiliate reward. */
export function isAffiliateEligible(
  type: string | null | undefined,
  value: number | null | undefined
): boolean {
  return (type === "PERCENT" || type === "FIXED") && !!value && value > 0;
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
