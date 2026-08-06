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
 * Generic JSON-catalog adapter — works with any provider whose get-offers
 * endpoint returns an array (or `{data|offers|response: [...] }`) of objects
 * using common field aliases. Used as the default for providers without a
 * dedicated adapter (OfferToro, Lootably, CPALead, Kiwiwall, Notik, Monlix…).
 * Owner sets the full API URL (with key/params) in the provider's apiEndpoint.
 */
export function makeGenericAdapter(key: string, label: string): OfferAdapter {
  return {
    key,
    label,
    supportsCatalog: true,
    async fetchOffers(creds: AdapterCredentials): Promise<NormalizedOffer[]> {
      const endpoint = creds.config.apiEndpoint;
      if (!endpoint) return [];
      let json: unknown;
      try {
        const res = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return [];
        json = await res.json();
      } catch {
        return [];
      }
      const container = json as Record<string, unknown> | unknown[];
      const rows: unknown[] = Array.isArray(container)
        ? container
        : (["data", "offers", "response", "result"]
            .map((k) => (container as Record<string, unknown>)[k])
            .find(Array.isArray) as unknown[] | undefined) ?? [];

      const offers: NormalizedOffer[] = [];
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        const row = r as Record<string, unknown>;
        const externalOfferId = asString(
          pickField(row, ["offer_id", "offerId", "id", "campaign_id"])
        );
        const title = asString(
          pickField(row, ["name", "title", "offer_name", "anchor_title"])
        );
        if (!externalOfferId || !title) continue;
        const instr = pickField(row, ["instructions", "requirements", "goals"]);
        offers.push({
          externalOfferId,
          title,
          description:
            asString(pickField(row, ["description", "desc", "conversion"])) ||
            undefined,
          instructions: Array.isArray(instr)
            ? instr.map(asString).filter(Boolean)
            : instr
            ? [asString(instr)]
            : [],
          imageUrl:
            asString(pickField(row, ["image_url", "imageUrl", "icon", "image"])) ||
            undefined,
          payoutUsd: asNum(pickField(row, ["payout", "revenue", "amount_usd"])),
          points: asNum(pickField(row, ["points", "amount", "currency_amount"])),
          countries: parseCountries(
            pickField(row, ["countries", "country", "geo", "countries_list"])
          ),
          trackingUrlTemplate:
            asString(pickField(row, ["url", "link", "tracking_url", "offer_url"])) ||
            undefined,
        });
      }
      return offers;
    },
  };
}
