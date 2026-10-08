/**
 * Where the cookie banner is required. Client-safe: no imports.
 *
 * GDPR / ePrivacy apply to the EU and EEA, the UK (UK GDPR) and Switzerland
 * (revFADP). Visitors there are asked before analytics / marketing cookies are
 * set; everyone else gets them on without a banner (src/components/user/
 * primitives/cookie-consent.tsx records that as an automatic consent).
 */
export const CONSENT_REGION_COUNTRIES = new Set([
  // EU
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA (non-EU), UK, Switzerland
  "IS", "LI", "NO", "GB", "CH",
]);

export function needsConsentBanner(country: string | null | undefined): boolean {
  return !!country && CONSENT_REGION_COUNTRIES.has(country.toUpperCase());
}

/** Where the visitor's region is cached in the browser (and for how long). */
export const REGION_STORAGE_KEY = "rt_consent_region_v1";
export const REGION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
