/**
 * What a user may see of a CPA offer. `trackingUrl` is deliberately absent:
 * the user reaches the network only through the /go/cpa/<id> redirect.
 * `scripts/verify-cpa.ts` asserts it stays absent.
 */
export const CPA_PUBLIC_OFFER_SELECT = {
  id: true,
  title: true,
  network: true,
  category: true,
  description: true,
  steps: true,
  logoUrl: true,
  imageUrl: true,
  points: true,
  estMinutes: true,
  difficulty: true,
  completionMode: true,
  proofRequired: true,
  proofInstructions: true,
  holdHours: true,
  featured: true,
  order: true,
  // Gate fields — read for the eligibility check, stripped before sending.
  status: true,
  totalCap: true,
  dailyCap: true,
  conversionsCount: true,
  countries: true,
  genders: true,
  regions: true,
  divisions: true,
  districts: true,
  subDistricts: true,
  postalCodes: true,
  minAge: true,
  maxAge: true,
} as const;

/** The user's own conversion, as the user sees it. */
export const CPA_MY_CONVERSION_SELECT = {
  id: true,
  offerId: true,
  status: true,
  points: true,
  proofImages: true,
  proofText: true,
  rejectionReason: true,
  heldUntil: true,
  creditedAt: true,
  createdAt: true,
  // When it was rejected — the retry wait counts from here.
  reviewedAt: true,
  attempts: true,
} as const;

const GATE_KEYS = [
  "status",
  "totalCap",
  "dailyCap",
  "conversionsCount",
  "countries",
  "genders",
  "regions",
  "divisions",
  "districts",
  "subDistricts",
  "postalCodes",
  "minAge",
  "maxAge",
] as const;

/** Drop the targeting/cap columns before an offer goes to the browser. */
export function toPublicCpaOffer<T extends Record<string, unknown>>(o: T): Omit<T, (typeof GATE_KEYS)[number]> {
  const out: Record<string, unknown> = { ...o };
  for (const k of GATE_KEYS) delete out[k];
  return out as Omit<T, (typeof GATE_KEYS)[number]>;
}
