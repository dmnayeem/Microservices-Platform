/**
 * CPA tracking links — pure, client-safe (no prisma), unit-checked by
 * scripts/verify-cpa.ts.
 *
 * An admin stores the network's link with macros; the user is only ever sent
 * the FILLED link, by a 302 from /go/cpa/<offerId>. The template itself never
 * leaves the server: it can carry the platform's publisher id and a network
 * that sees users hand-editing the sub-id stops paying.
 */

/** Macros an admin may put in a tracking link. Matched case-insensitively. */
export const CPA_MACROS = ["username", "userId", "clickId", "country"] as const;
export type CpaMacro = (typeof CPA_MACROS)[number];

export type CpaLinkValues = Partial<Record<CpaMacro, string | null | undefined>>;

const MACRO_RE = /\{(username|userid|clickid|country)\}/gi;

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * True when the template, once its macros are filled, is an http(s) URL.
 * `javascript:`, `data:`, relative paths and anything unparseable are refused —
 * the route 302s to whatever this produces.
 */
export function isValidCpaTemplate(template: string | null | undefined): boolean {
  if (!template || typeof template !== "string") return false;
  const t = template.trim();
  if (!t || /\s/.test(t)) return false;
  return isHttpUrl(t.replace(MACRO_RE, "x"));
}

/**
 * Fill the macros with URI-encoded values. Returns null when the template is
 * not an http(s) link. A missing value becomes an empty string, never the
 * literal text "{country}" or "undefined".
 */
export function buildCpaTrackingUrl(
  template: string,
  values: CpaLinkValues
): string | null {
  if (!isValidCpaTemplate(template)) return null;
  const lookup: Record<string, string> = {};
  for (const m of CPA_MACROS) lookup[m.toLowerCase()] = values[m] ?? "";
  const out = template
    .trim()
    .replace(MACRO_RE, (_all, name: string) =>
      encodeURIComponent(lookup[name.toLowerCase()] ?? "")
    );
  return isHttpUrl(out) ? out : null;
}
