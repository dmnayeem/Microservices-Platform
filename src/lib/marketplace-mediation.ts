import { prisma } from "@/lib/prisma";

/**
 * Admin-mediation fee config for escrow deals. When a deal is admin-mediated
 * (an admin joins as escrow/arbiter), the buyer pays this fee ON TOP of the deal
 * amount and it goes to the platform. Stored in the `marketplace_admin_mediation`
 * SystemSetting; mirrors src/lib/marketplace-commission.ts.
 */

export interface MediationConfig {
  /** Whether admin-mediated deals may be created at all. */
  enabled: boolean;
  /** Fee in basis points (1 bps = 0.01%) of the deal amount. */
  feeBps: number;
}

const SETTING_KEY = "marketplace_admin_mediation";

export const DEFAULT_MEDIATION: MediationConfig = { enabled: true, feeBps: 300 }; // 3%

function clampBps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MEDIATION.feeBps;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

/** Read mediation config from SystemSetting; falls back to DEFAULT. */
export async function getMediationConfig(): Promise<MediationConfig> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });
  if (!row?.value || typeof row.value !== "object") return DEFAULT_MEDIATION;
  const v = row.value as Partial<MediationConfig>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_MEDIATION.enabled,
    feeBps: typeof v.feeBps === "number" ? clampBps(v.feeBps) : DEFAULT_MEDIATION.feeBps,
  };
}

/** Fee (rounded to cents) charged for mediating a deal of `amount`. */
export function mediationFee(amount: number, feeBps: number): number {
  return Math.round((amount * clampBps(feeBps)) / 10000 * 100) / 100;
}

/** Persist mediation config. Admin-only at the call site. */
export async function saveMediationConfig(cfg: MediationConfig): Promise<void> {
  const payload: MediationConfig = {
    enabled: !!cfg.enabled,
    feeBps: clampBps(cfg.feeBps),
  };
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, category: "marketplace", value: payload as unknown as object },
    update: { category: "marketplace", value: payload as unknown as object },
  });
}
