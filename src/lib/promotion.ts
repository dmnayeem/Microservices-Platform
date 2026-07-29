import { prisma } from "@/lib/prisma";

/**
 * Self-serve promotion: a seller/tutor pays (cash or points) to feature their
 * own listing/course for N days so it floats to the top of browse. Packages are
 * admin-configurable via the `promotion_pricing` SystemSetting; defaults below.
 */

export interface PromoPackage {
  id: string;
  label: string;
  days: number;
  priceCash: number; // USD from cashBalance
  pricePoints: number; // from pointsBalance
}

export const DEFAULT_PROMO_PACKAGES: PromoPackage[] = [
  { id: "featured-7", label: "Featured — 7 days", days: 7, priceCash: 5, pricePoints: 500 },
  { id: "featured-30", label: "Featured — 30 days", days: 30, priceCash: 15, pricePoints: 1500 },
];

const SETTING_KEY = "promotion_pricing";

function sanitize(list: unknown): PromoPackage[] {
  if (!Array.isArray(list)) return DEFAULT_PROMO_PACKAGES;
  const cleaned = list
    .map((raw): PromoPackage | null => {
      const p = raw as Partial<PromoPackage>;
      if (!p || typeof p.id !== "string" || !p.id) return null;
      return {
        id: p.id,
        label: typeof p.label === "string" ? p.label : p.id,
        days: Math.max(1, Math.min(365, Math.round(Number(p.days) || 0))),
        priceCash: Math.max(0, Math.round((Number(p.priceCash) || 0) * 100) / 100),
        pricePoints: Math.max(0, Math.round(Number(p.pricePoints) || 0)),
      };
    })
    .filter((p): p is PromoPackage => p !== null);
  return cleaned.length ? cleaned : DEFAULT_PROMO_PACKAGES;
}

export async function getPromotionPricing(): Promise<PromoPackage[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  return sanitize(row?.value ?? null);
}

export async function savePromotionPricing(packages: PromoPackage[]): Promise<void> {
  const payload = sanitize(packages);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, category: "marketplace", value: payload as unknown as object },
    update: { category: "marketplace", value: payload as unknown as object },
  });
}

export async function resolvePromoPackage(id: string): Promise<PromoPackage | null> {
  const list = await getPromotionPricing();
  return list.find((p) => p.id === id) ?? null;
}
