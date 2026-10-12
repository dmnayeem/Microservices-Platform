import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { realCountry } from "@/lib/client-ip";

/**
 * The one place an ad event's country is decided.
 *
 * No ad event recorded a country anywhere — not the impression counter, not the
 * click bill, not `AdEngagement` — so "which country are my clicks and
 * impressions coming from?" had no answer at all.
 *
 * Impressions and clicks are counted on two different code paths (a buffered
 * counter in `ad-counters.ts`, a synchronous CAS in `ad-events.ts`). If each one
 * resolved a country its own way they would eventually disagree, and a CTR built
 * from an impression attributed to BD and a click attributed to unknown is worse
 * than no number: it is a wrong number that looks right. Both call this.
 */

/**
 * The explicit "we do not know" bucket.
 *
 * `ZZ` is the ISO-3166-1 user-assigned code conventionally used for exactly
 * this. It is a stored VALUE, never a null: a nullable country column drops out
 * of every `groupBy`, every join and every chart, so unknowns would vanish and
 * the remaining slices would silently renormalise to 100%. The owner would read
 * "all my traffic is from Bangladesh" when the truth is "the only country I ever
 * managed to tag was Bangladesh".
 */
export const UNKNOWN_COUNTRY = "ZZ";

/**
 * The country comes from the edge for free — no lookup, no third-party call —
 * and it is the member's real country rather than whatever they typed into a
 * profile form. Read through lib/client-ip.ts `realCountry`, which knows that
 * behind Cloudflare Vercel's own header is the Cloudflare data centre's.
 */

/**
 * Codes an edge can emit that are not places.
 *
 * Vercel/Cloudflare return `T1` for Tor exit traffic and `XX`/`X1` when the IP
 * could not be located. Storing them as if they were countries would put a
 * country named "T1" in the owner's revenue breakdown. They mean "unknown", so
 * they are stored as unknown.
 */
const NON_COUNTRY_CODES = new Set(["T1", "XX", "X1", "ZZ", "EU", "AP"]);

/**
 * Coerce anything into a storable country code.
 *
 * Returns a 2-letter uppercase ISO code, or `UNKNOWN_COUNTRY`. `User.country` is
 * documented in the schema as an ISO code and the ad targeting matcher compares
 * it against ISO codes, so a value that is not two letters (a free-typed country
 * NAME, a leftover from an older form) is not silently half-trusted — it becomes
 * an explicit unknown rather than a bogus bucket.
 */
export function normalizeCountry(raw: string | null | undefined): string {
  const code = (raw ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return UNKNOWN_COUNTRY;
  if (NON_COUNTRY_CODES.has(code)) return UNKNOWN_COUNTRY;
  return code;
}

/**
 * Read the edge's country header for the current request.
 *
 * `headers()` throws outside a request scope — a cron sweep, a seed script, the
 * campaign sweeper — and an analytics dimension must never break ad serving or,
 * far worse, a click BILL. Outside a request there is simply no viewer country
 * to read, so this returns null and the caller falls through to the profile.
 */
async function headerCountry(): Promise<string | null> {
  try {
    const h = await headers();
    // The member's real country — through Cloudflare, Vercel's header is the
    // Cloudflare data centre's (lib/client-ip.ts).
    const code = normalizeCountry(realCountry(h));
    if (code !== UNKNOWN_COUNTRY) return code;
  } catch {
    /* not in a request scope */
  }
  return null;
}

/**
 * Resolve the country to record against one ad event. Never throws, never null.
 *
 * Order, and why:
 *
 *  1. **The edge header.** Free, present on every real Vercel request, and it
 *     describes where the viewer actually is.
 *  2. **`User.country`** from the profile — only when the header is absent
 *     (local dev, a self-hosted run, a proxy that strips it). It is a weak
 *     source: at the time this shipped only 18 of 48 accounts had it set, and
 *     an anonymous viewer has no profile at all. It is a fallback, not a source.
 *  3. **`ZZ`.** Explicitly unknown, and counted as such.
 *
 * `profileCountry` lets a caller that has ALREADY loaded the viewer (both serve
 * paths select `country` for targeting) hand it over instead of paying for a
 * second read of the same row on the hot serve path.
 */
export async function resolveEventCountry(opts: {
  userId?: string | null;
  /** Viewer's profile country, when the caller already has it in hand. */
  profileCountry?: string | null;
}): Promise<string> {
  const fromEdge = await headerCountry();
  if (fromEdge) return fromEdge;

  if (opts.profileCountry !== undefined) {
    return await profileCountryCode(opts.profileCountry);
  }

  if (!opts.userId) return UNKNOWN_COUNTRY;
  try {
    const u = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { country: true },
      // Same TTL as the targeting read in ad-serve: a profile country changes
      // about never, and this sits in front of a click bill.
      cacheStrategy: { ttl: 60, swr: 300 },
    });
    return await profileCountryCode(u?.country);
  } catch {
    return UNKNOWN_COUNTRY;
  }
}

/**
 * A profile country, coerced to a storable code — tolerantly.
 *
 * `normalizeCountry()` alone rejects anything that is not two letters, which is
 * right for an edge header (a header is machine-written; a three-letter value
 * there is garbage) but wrong for a profile field, which is human-written and
 * historically accepted free text. Three accounts hold "Bangladesh": under the
 * strict rule their every impression landed in the `ZZ` unknown bucket, which
 * is not "we could not tell" — we could tell perfectly well.
 *
 * So a non-ISO2 profile value gets one more chance through the canonical
 * `Country` table (full name, ISO3) before it becomes unknown. The result still
 * passes through `normalizeCountry`, so the non-country codes (`T1`, `XX`, …)
 * stay excluded and the stored value is always a real two-letter code or `ZZ`.
 */
async function profileCountryCode(
  raw: string | null | undefined
): Promise<string> {
  const strict = normalizeCountry(raw);
  if (strict !== UNKNOWN_COUNTRY) return strict;
  const v = (raw ?? "").trim();
  if (!v) return UNKNOWN_COUNTRY;
  try {
    const { resolveCountryCode } = await import("@/lib/country-codes");
    return normalizeCountry(await resolveCountryCode(v));
  } catch {
    return UNKNOWN_COUNTRY;
  }
}

/** Region names, for labelling `ZZ` and any code Intl does not know. */
const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/**
 * Human label for a stored code. `ZZ` is "Unknown", never blank and never
 * dropped — the share of unknown traffic is itself a fact the owner needs.
 */
export function countryLabel(code: string): string {
  if (!code || code === UNKNOWN_COUNTRY) return "Unknown";
  try {
    return REGION_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Regional-indicator flag for a code. Empty for unknown — no flag for nowhere. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === UNKNOWN_COUNTRY) return "";
  return String.fromCodePoint(
    ...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}
