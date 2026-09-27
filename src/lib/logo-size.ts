/**
 * The logo-height controls at /admin/seo — client-safe (the admin form uses
 * them for its sliders; seo-settings.ts is server-only). The app's top bar is
 * 56px tall, so its logo stops at 52; the marketing navbar has more room.
 */
export const LOGO_HEIGHT_RANGE = {
  "seo.logo_height_site": { min: 20, max: 96, def: 44 },
  "seo.logo_height_app": { min: 20, max: 52, def: 40 },
} as const;

export type LogoHeightKey = keyof typeof LOGO_HEIGHT_RANGE;

export function logoHeight(v: string | undefined, key: LogoHeightKey): number {
  const r = LOGO_HEIGHT_RANGE[key];
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(r.max, Math.max(r.min, n)) : r.def;
}
