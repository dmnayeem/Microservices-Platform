// Provider offer-adapter framework. Each third-party offerwall/survey network
// exposes a slightly different "get offers" JSON API; an adapter normalizes it
// into `NormalizedOffer` rows we upsert into OfferwallOffer (source=PROVIDER).
//
// Live fetching needs the provider's API key/secret (owner-supplied in the
// admin Providers tab). Adapters are defensive: they parse unknown JSON and
// return [] on any shape mismatch rather than throwing.

export interface NormalizedOffer {
  /** Provider's stable offer id — used for upsert + postback matching. */
  externalOfferId: string;
  title: string;
  description?: string;
  instructions: string[];
  imageUrl?: string;
  /** Provider revenue in USD (source of truth for points conversion). */
  payoutUsd?: number;
  /** Provider-declared points (fallback when payoutUsd is absent). */
  points?: number;
  /** ISO-2 country codes the offer is eligible in (empty = all). */
  countries: string[];
  /** Click/tracking URL template with {userId}/{clickId} placeholders. */
  trackingUrlTemplate?: string;
}

export interface AdapterCredentials {
  provider: string;
  apiKey: string | null;
  secretKey: string | null;
  /** The typed provider config (apiEndpoint, apiParams, kind, …). */
  config: {
    apiEndpoint?: string;
    apiParams?: Record<string, string>;
    kind: "OFFER" | "SURVEY";
  };
}

export interface OfferAdapter {
  /** Machine key matching OfferwallConfig.provider (e.g. "ADGATE_MEDIA"). */
  key: string;
  label: string;
  /** True when this adapter can pull a native offer catalog via API. */
  supportsCatalog: boolean;
  /** Fetch + normalize the provider's current offers. */
  fetchOffers(creds: AdapterCredentials): Promise<NormalizedOffer[]>;
}

const asString = (v: unknown): string => (v == null ? "" : String(v));
const asNum = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Best-effort field pick across common provider key aliases. */
export function pickField(
  row: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

/** Parse a countries value that may be an array, CSV string, or single code. */
export function parseCountries(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x).toUpperCase()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,;\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  return [];
}

export const _fieldHelpers = { asString, asNum };
