// Client-safe: the blue badge shop's catalogue and the admin's price config.
// Server logic (buying, renewing, lapsing) is in lib/badges-server.ts.

import { VERIFIED_BADGE_STYLES, type VerifiedBadgeStyle } from "@/components/user/profile/verified-badge";

/**
 * Owner, 2026-10-05: the blue badge is sold monthly ($4.99, in no plan for
 * free) and every other style — premium colours and animated ones — is a
 * $1.99/month add-on on top of an active badge. Both are the defaults below;
 * the admin changes them at /admin/badges.
 */
export const BADGE_CONFIG_SETTING = "badges.config";
export const BADGE_PERIOD_DAYS = 30;

export type BadgeStyleKind = "included" | "color" | "animated";

export const BADGE_STYLE_KIND: Record<VerifiedBadgeStyle, BadgeStyleKind> = {
  BLUE: "included",
  GOLD: "color",
  RAINBOW: "color",
  EMERALD: "color",
  PURPLE: "color",
  ROSE: "color",
  OCEAN: "color",
  BLUE_FLAME: "animated",
  FIRE: "animated",
  AURORA: "animated",
  NEON: "animated",
  GALAXY: "animated",
  GOLD_SHIMMER: "animated",
  ICE: "animated",
  PLASMA: "animated",
};

export const BADGE_STYLE_KEYS = Object.keys(BADGE_STYLE_KIND) as VerifiedBadgeStyle[];
/** Styles that are sold (everything except the blue that comes with the badge). */
export const PAID_STYLE_KEYS = BADGE_STYLE_KEYS.filter((k) => BADGE_STYLE_KIND[k] !== "included");

export interface BadgeConfig {
  /** The shop is open (off: nothing can be bought; owned badges keep working). */
  enabled: boolean;
  badgePriceUsd: number;
  styles: Record<string, { enabled: boolean; priceUsd: number }>;
}

export const DEFAULT_BADGE_CONFIG: BadgeConfig = {
  enabled: true,
  badgePriceUsd: 4.99,
  styles: Object.fromEntries(PAID_STYLE_KEYS.map((k) => [k, { enabled: true, priceUsd: 1.99 }])),
};

const price = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : fallback;
};

export function sanitizeBadgeConfig(raw: unknown): BadgeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const styles = (r.styles && typeof r.styles === "object" ? r.styles : {}) as Record<string, unknown>;
  return {
    enabled: r.enabled !== false,
    badgePriceUsd: price(r.badgePriceUsd, DEFAULT_BADGE_CONFIG.badgePriceUsd),
    styles: Object.fromEntries(
      PAID_STYLE_KEYS.map((k) => {
        const s = (styles[k] && typeof styles[k] === "object" ? styles[k] : {}) as Record<string, unknown>;
        const d = DEFAULT_BADGE_CONFIG.styles[k];
        return [k, { enabled: s.enabled !== false, priceUsd: price(s.priceUsd, d.priceUsd) }];
      })
    ),
  };
}

export function styleLabel(key: string): string {
  return (VERIFIED_BADGE_STYLES as Record<string, { label: string }>)[key]?.label ?? key;
}

export function isBadgeStyle(v: unknown): v is VerifiedBadgeStyle {
  return typeof v === "string" && v in BADGE_STYLE_KIND;
}
