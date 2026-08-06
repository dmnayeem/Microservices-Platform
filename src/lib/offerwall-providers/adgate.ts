import {
  type OfferAdapter,
  type NormalizedOffer,
  type AdapterCredentials,
  pickField,
  parseCountries,
  _fieldHelpers,
} from "./types";

const { asString, asNum } = _fieldHelpers;

/**
 * AdGate Media (Prodege) "User-Based API v1" get-offers adapter.
 * Endpoint (owner-supplied, includes wall code + api key), returns
 * `{ data: [ { offer_id, name, description, instructions, anchor, points,
 *   payout, countries, image_url }, … ] }`. Defensive against shape drift.
 * Docs: https://docs.adgatemedia.com/apis/user-based-api-v1/get-offers
 */
export const adgateAdapter: OfferAdapter = {
  key: "ADGATE_MEDIA",
  label: "AdGate Media",
  supportsCatalog: true,
  async fetchOffers(creds: AdapterCredentials): Promise<NormalizedOffer[]> {
    const endpoint = creds.config.apiEndpoint;
    if (!endpoint) return [];
    let json: unknown;
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        // Never cache a catalog pull.
        cache: "no-store",
      });
      if (!res.ok) return [];
      json = await res.json();
    } catch {
      return [];
    }
    const rows: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray((json as { data?: unknown[] })?.data)
      ? (json as { data: unknown[] }).data
      : [];

    const offers: NormalizedOffer[] = [];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const externalOfferId = asString(
        pickField(row, ["offer_id", "offerId", "id"])
      );
      if (!externalOfferId) continue;
      const title = asString(pickField(row, ["name", "title", "offer_name"]));
      if (!title) continue;
      const instr = pickField(row, ["instructions", "requirements", "goals"]);
      offers.push({
        externalOfferId,
        title,
        description: asString(pickField(row, ["description", "desc"])) || undefined,
        instructions: Array.isArray(instr)
          ? instr.map(asString).filter(Boolean)
          : instr
          ? [asString(instr)]
          : [],
        imageUrl:
          asString(pickField(row, ["image_url", "imageUrl", "icon", "image"])) ||
          undefined,
        payoutUsd: asNum(pickField(row, ["payout", "revenue", "payout_usd"])),
        points: asNum(pickField(row, ["points", "currency_amount", "amount"])),
        countries: parseCountries(
          pickField(row, ["countries", "country", "geo", "geo_targeting"])
        ),
        trackingUrlTemplate:
          asString(pickField(row, ["anchor", "tracking_url", "url", "link"])) ||
          undefined,
      });
    }
    return offers;
  },
};
