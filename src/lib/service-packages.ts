/**
 * Service packages (Basic / Standard / Premium), order requirements and the
 * order brief — pure helpers shared by the service form, the listing page,
 * the order API and the deal thread. Client-safe: no prisma, no server code.
 *
 * Storage (no schema change):
 *  - packages + requirements live in `MarketplaceListing.details` JSON
 *    (`details.packages`, `details.requirements`);
 *  - what a buyer ordered (tier snapshot, requirement answers, due date) is an
 *    ORDER message in the deal's thread, because MarketplaceDeal has no JSON
 *    column. The snapshot is taken at order time, so a seller editing their
 *    packages later never changes an order already in escrow.
 */

export const PACKAGE_IDS = ["basic", "standard", "premium"] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];
export const PACKAGE_LABEL: Record<PackageId, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

export interface ServicePackage {
  id: PackageId;
  name: string;
  description: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  items: string[];
}

export const REQUIREMENT_TYPES = ["text", "textarea", "url", "file"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  text: "Short answer",
  textarea: "Long answer",
  url: "Link",
  file: "File link",
};

export interface ServiceRequirement {
  id: string;
  label: string;
  type: RequirementType;
  required: boolean;
}

export interface RequirementAnswer {
  id: string;
  label: string;
  type: RequirementType;
  value: string;
}

/** The terms an order is placed on — a package, or the single-price service. */
export interface OrderTier {
  id: string;
  name: string;
  price: number;
  /** null = the seller set no delivery time (single-price service). */
  deliveryDays: number | null;
  revisions: number;
  items: string[];
}

export interface OrderBrief {
  v: 1;
  dealId: string;
  tier: OrderTier;
  answers: RequirementAnswer[];
  orderedAt: string;
  /** Delivery due date (ISO), from the tier's delivery days. */
  dueAt: string | null;
}

/** Thread-message sender types used by service orders. */
export const ORDER_SENDER_TYPE = "ORDER";
export const DELIVERY_SENDER_TYPE = "DELIVERY";
export const REVISION_SENDER_TYPE = "REVISION";

export const MAX_REQUIREMENTS = 10;
export const MAX_PACKAGE_ITEMS = 10;
export const MAX_REVISIONS = 20;
export const MAX_DELIVERY_DAYS = 365;
const MAX_PRICE = 1_000_000;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : null;
};
const money = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/**
 * Validate seller-entered packages. Returns them in Basic → Premium order.
 * An empty / missing list is valid (single-price service).
 */
export function sanitizePackages(
  raw: unknown
): { ok: true; packages: ServicePackage[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, packages: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Packages must be a list." };
  const seen = new Set<string>();
  const out: ServicePackage[] = [];
  for (const p of raw) {
    if (!isObj(p)) return { ok: false, error: "Invalid package." };
    const id = p.id as PackageId;
    if (!PACKAGE_IDS.includes(id)) return { ok: false, error: "Unknown package tier." };
    if (seen.has(id)) return { ok: false, error: "Each package tier can appear once." };
    seen.add(id);
    const label = PACKAGE_LABEL[id];
    const name = str(p.name, 60) || label;
    const price = money(p.price);
    if (price == null || price < 0.5 || price > MAX_PRICE) {
      return { ok: false, error: `${label} package: price must be between $0.50 and $1,000,000.` };
    }
    const deliveryDays = int(p.deliveryDays);
    if (deliveryDays == null || deliveryDays < 1 || deliveryDays > MAX_DELIVERY_DAYS) {
      return { ok: false, error: `${label} package: delivery time must be 1–${MAX_DELIVERY_DAYS} days.` };
    }
    const revisions = int(p.revisions) ?? 0;
    if (revisions < 0 || revisions > MAX_REVISIONS) {
      return { ok: false, error: `${label} package: revisions must be 0–${MAX_REVISIONS}.` };
    }
    const items = (Array.isArray(p.items) ? p.items : [])
      .map((x) => str(x, 120))
      .filter(Boolean)
      .slice(0, MAX_PACKAGE_ITEMS);
    out.push({ id, name, description: str(p.description, 300), price, deliveryDays, revisions, items });
  }
  out.sort((a, b) => PACKAGE_IDS.indexOf(a.id) - PACKAGE_IDS.indexOf(b.id));
  return { ok: true, packages: out };
}

/** Validate seller-defined order questions. Empty / missing is valid. */
export function sanitizeRequirements(
  raw: unknown
): { ok: true; requirements: ServiceRequirement[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, requirements: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Requirements must be a list." };
  if (raw.length > MAX_REQUIREMENTS) {
    return { ok: false, error: `At most ${MAX_REQUIREMENTS} order questions.` };
  }
  const seen = new Set<string>();
  const out: ServiceRequirement[] = [];
  for (const [i, r] of raw.entries()) {
    if (!isObj(r)) return { ok: false, error: "Invalid order question." };
    const label = str(r.label, 200);
    if (!label) return { ok: false, error: `Order question ${i + 1} needs a question.` };
    const type = REQUIREMENT_TYPES.includes(r.type as RequirementType)
      ? (r.type as RequirementType)
      : "text";
    let id = str(r.id, 32).replace(/[^a-zA-Z0-9_-]/g, "") || `q${i + 1}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    out.push({ id, label, type, required: r.required === true });
  }
  return { ok: true, requirements: out };
}

/** Packages stored on a listing (tolerant read — bad rows are dropped). */
export function readPackages(details: unknown): ServicePackage[] {
  if (!isObj(details)) return [];
  const r = sanitizePackages(details.packages);
  if (r.ok) return r.packages;
  // One bad row should not hide the others on a live page.
  const list = Array.isArray(details.packages) ? details.packages : [];
  return list.flatMap((p) => {
    const one = sanitizePackages([p]);
    return one.ok ? one.packages : [];
  });
}

export function readRequirements(details: unknown): ServiceRequirement[] {
  if (!isObj(details)) return [];
  const r = sanitizeRequirements(details.requirements);
  return r.ok ? r.requirements : [];
}

export function cheapestPackage(packages: ServicePackage[]): ServicePackage | null {
  return packages.reduce<ServicePackage | null>(
    (min, p) => (min == null || p.price < min.price ? p : min),
    null
  );
}

/**
 * The tier an order is placed on. With packages the buyer must pick one of
 * them; without, the service is a single "Standard" tier at the listing price
 * with the delivery time / revisions from the service fields.
 */
export function resolveServiceTier(
  details: unknown,
  listingPrice: number,
  tierId: string | null | undefined
): { ok: true; tier: OrderTier } | { ok: false; error: string } {
  const packages = readPackages(details);
  if (packages.length > 0) {
    const p = tierId ? packages.find((x) => x.id === tierId) : packages.length === 1 ? packages[0] : null;
    if (!p) return { ok: false, error: "Choose a package." };
    return {
      ok: true,
      tier: {
        id: p.id,
        name: p.name,
        price: p.price,
        deliveryDays: p.deliveryDays,
        revisions: p.revisions,
        items: p.items,
      },
    };
  }
  if (!Number.isFinite(listingPrice) || listingPrice <= 0) {
    return { ok: false, error: "This service has no valid price." };
  }
  const d = isObj(details) ? details : {};
  const days = int(d.turnaroundDays);
  const revs = int(d.revisions);
  return {
    ok: true,
    tier: {
      id: "single",
      name: "Standard",
      price: Math.round(listingPrice * 100) / 100,
      deliveryDays: days != null && days > 0 ? Math.min(days, MAX_DELIVERY_DAYS) : null,
      revisions: revs != null && revs > 0 ? Math.min(revs, MAX_REVISIONS) : 0,
      items: [],
    },
  };
}

/** Check the buyer's answers against the seller's questions. */
export function validateAnswers(
  requirements: ServiceRequirement[],
  raw: unknown
): { ok: true; answers: RequirementAnswer[] } | { ok: false; error: string } {
  const given = isObj(raw) ? raw : {};
  const answers: RequirementAnswer[] = [];
  for (const q of requirements) {
    const value = str(given[q.id], q.type === "textarea" ? 4000 : 1000);
    if (!value) {
      if (q.required) return { ok: false, error: `Please answer: "${q.label}"` };
      continue;
    }
    if ((q.type === "url" || q.type === "file") && !/^https?:\/\/\S+$/i.test(value)) {
      return { ok: false, error: `"${q.label}" must be a link starting with http:// or https://` };
    }
    answers.push({ id: q.id, label: q.label, type: q.type, value });
  }
  return { ok: true, answers };
}

export function encodeOrderBrief(b: OrderBrief): string {
  return JSON.stringify(b);
}

export function parseOrderBrief(body: string | null | undefined): OrderBrief | null {
  if (!body) return null;
  try {
    const b = JSON.parse(body) as OrderBrief;
    if (b?.v !== 1 || typeof b.dealId !== "string" || !isObj(b.tier)) return null;
    return {
      ...b,
      answers: Array.isArray(b.answers) ? b.answers : [],
      tier: { ...b.tier, items: Array.isArray(b.tier.items) ? b.tier.items : [] },
    };
  } catch {
    return null;
  }
}

/** Due date from now + delivery days (null when the tier has none). */
export function dueDateFrom(start: Date, deliveryDays: number | null): Date | null {
  return deliveryDays && deliveryDays > 0 ? new Date(start.getTime() + deliveryDays * 86_400_000) : null;
}

/**
 * Normalise a service's `details` before it is saved: validated packages and
 * order questions written back (or removed when empty), and the legacy
 * `turnaroundDays` / `revisions` fields synced to the cheapest package so the
 * cards and every older reader agree. `startingPrice` is what the listing's
 * headline `price` must be (the cheapest package), or null without packages.
 */
export function normalizeServiceDetails(
  details: Record<string, unknown>
):
  | { ok: true; details: Record<string, unknown>; startingPrice: number | null }
  | { ok: false; error: string } {
  const pk = sanitizePackages(details.packages);
  if (!pk.ok) return pk;
  const rq = sanitizeRequirements(details.requirements);
  if (!rq.ok) return rq;
  const out: Record<string, unknown> = { ...details };
  delete out.packages;
  delete out.requirements;
  if (rq.requirements.length > 0) out.requirements = rq.requirements;
  const cheapest = cheapestPackage(pk.packages);
  if (cheapest) {
    out.packages = pk.packages;
    out.turnaroundDays = cheapest.deliveryDays;
    out.revisions = cheapest.revisions;
  }
  return { ok: true, details: out, startingPrice: cheapest?.price ?? null };
}
