import type { OfferAdapter } from "./types";
import { adgateAdapter } from "./adgate";
import { makeGenericAdapter } from "./generic";

export type { OfferAdapter, NormalizedOffer, AdapterCredentials } from "./types";

// Registry: provider machine-key → adapter. AdGate has a dedicated adapter; the
// rest use the generic JSON-catalog adapter (owner points apiEndpoint at the
// provider's get-offers URL). Add a dedicated adapter when a provider's shape
// or auth needs special handling.
const ADAPTERS: Record<string, OfferAdapter> = {
  ADGATE_MEDIA: adgateAdapter,
  OFFERTORO: makeGenericAdapter("OFFERTORO", "OfferToro"),
  ADGEM: makeGenericAdapter("ADGEM", "AdGem"),
  LOOTABLY: makeGenericAdapter("LOOTABLY", "Lootably"),
  CPALEAD: makeGenericAdapter("CPALEAD", "CPALead"),
  KIWIWALL: makeGenericAdapter("KIWIWALL", "Kiwiwall"),
  NOTIK: makeGenericAdapter("NOTIK", "Notik"),
  MONLIX: makeGenericAdapter("MONLIX", "Monlix"),
  AYET: makeGenericAdapter("AYET", "ayet Studios"),
  BITLABS: makeGenericAdapter("BITLABS", "BitLabs"),
};

/** Adapter for a provider, or a generic one so any API provider can still sync. */
export function getOfferAdapter(provider: string): OfferAdapter {
  return ADAPTERS[provider] ?? makeGenericAdapter(provider, provider);
}

export function hasDedicatedAdapter(provider: string): boolean {
  return provider in ADAPTERS;
}
