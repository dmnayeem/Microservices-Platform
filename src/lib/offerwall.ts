// Internal offerwall catalog helpers: provider-config parsing, tracking-URL
// (subid) building, USD→points, country filtering, and per-category sequential
// unlock. Server-only (imports prisma). Mirrors task-sequence.ts for unlocks.
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";

export type OfferSource = "MANUAL" | "PROVIDER";
export type CompletionMode = "PROOF" | "POSTBACK" | "MANUAL";
export type IntegrationType = "IFRAME" | "API";
export type ProviderKind = "OFFER" | "SURVEY";

/** Typed view of the untyped `OfferwallConfig.config` JSON blob. */
export interface OfferwallProviderConfig {
  integrationType: IntegrationType;
  kind: ProviderKind;
  iframeUrl?: string;
  apiEndpoint?: string;
  apiParams?: Record<string, string>;
  rewardMultiplier: number;
  holdHours: number;
  autoCredit: boolean;
  testMode: boolean;
}

const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/** Read the stored provider `config` JSON into a typed, defaulted shape. */
export function parseOfferwallConfig(v: unknown): OfferwallProviderConfig {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    integrationType: c.integrationType === "API" ? "API" : "IFRAME",
    kind: c.kind === "SURVEY" ? "SURVEY" : "OFFER",
    iframeUrl: typeof c.iframeUrl === "string" ? c.iframeUrl : undefined,
    apiEndpoint: typeof c.apiEndpoint === "string" ? c.apiEndpoint : undefined,
    apiParams:
      c.apiParams && typeof c.apiParams === "object"
        ? (c.apiParams as Record<string, string>)
        : undefined,
    rewardMultiplier: Math.max(0, num(c.rewardMultiplier, 1)),
    holdHours: Math.max(0, Math.round(num(c.holdHours, 0))),
    autoCredit: c.autoCredit === true,
    testMode: c.testMode === true,
  };
}

/**
 * Build the "Start Work" destination for an offer, injecting the user id and
 * click id (subid) that the provider will echo back in its postback. Falls back
 * to a bare `#` when the offer has no tracking URL (proof/manual offers open the
 * admin-provided instructions instead).
 */
export function buildTrackingUrl(
  template: string | null | undefined,
  userId: string,
  clickId: string
): string {
  if (!template) return "";
  return template
    .replace(/\{userId\}/gi, encodeURIComponent(userId))
    .replace(/\{clickId\}/gi, encodeURIComponent(clickId))
    .replace(/\{subId\}/gi, encodeURIComponent(clickId));
}

/** Convert a provider USD payout to platform points at the current rate. */
export async function pointsFromUsd(usd: number): Promise<number> {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * (await getPointsPerUsd()));
}

/** True if an offer's country allowlist admits this user's country. */
export function offerAllowsCountry(
  offerCountries: string[],
  userCountry: string | null | undefined
): boolean {
  if (!offerCountries || offerCountries.length === 0) return true; // all countries
  if (!userCountry) return false; // targeted offer + unknown user country → hide
  return offerCountries.includes(userCountry);
}

// ── Per-category sequential unlock ──
// Offers within a category form an ordered chain (by `order`). An offer is
// "satisfied" once the user has a PENDING/APPROVED completion for it (a permanent
// progression, unlike the daily task chain). Only the first unsatisfied offer in
// each category is startable; the rest are locked.
export interface OfferChainState {
  lockedOfferIds: Set<string>;
  /** categoryId → the one currently-active (startable) offer id. */
  activeByCategory: Map<string, string>;
}

const SATISFYING = new Set(["PENDING", "APPROVED"]);

export async function getOfferChainState(
  userId: string
): Promise<OfferChainState> {
  const offers = (await prisma.offerwallOffer.findMany({
    where: { isActive: true, category: { isActive: true } },
    orderBy: [{ categoryId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, categoryId: true },
  })) as unknown as Array<{ id: string; categoryId: string }>;

  const completions = (await prisma.offerwallCompletion.findMany({
    where: { userId, status: { in: ["PENDING", "APPROVED"] } },
    select: { offerId: true, status: true },
  })) as unknown as Array<{ offerId: string; status: string }>;
  const satisfied = new Set(
    completions.filter((c) => SATISFYING.has(c.status)).map((c) => c.offerId)
  );

  const lockedOfferIds = new Set<string>();
  const activeByCategory = new Map<string, string>();
  const frontierPassed = new Set<string>(); // categories whose active offer is found

  for (const o of offers) {
    if (frontierPassed.has(o.categoryId)) {
      lockedOfferIds.add(o.id);
      continue;
    }
    if (satisfied.has(o.id)) continue; // already done → chain advances
    activeByCategory.set(o.categoryId, o.id);
    frontierPassed.add(o.categoryId);
  }

  return { lockedOfferIds, activeByCategory };
}

/**
 * Release held (post-hold-window) postback completions: credit points + write a
 * ledger Transaction and flip PENDING→APPROVED. Held completions are the only
 * PENDING ones with a non-null `heldUntil`; proof completions (heldUntil null)
 * are left for admin review. Idempotent per completion (status guard).
 */
export async function releaseHeldOfferwallCompletions(now = new Date()): Promise<number> {
  const due = (await prisma.offerwallCompletion.findMany({
    where: { status: "PENDING", heldUntil: { not: null, lte: now } },
    select: { id: true, userId: true, points: true, payoutUsd: true, offerId: true },
    take: 500,
  })) as unknown as Array<{
    id: string;
    userId: string;
    points: number;
    payoutUsd: unknown;
    offerId: string;
  }>;

  let released = 0;
  for (const c of due) {
    const amount = Number(c.payoutUsd ?? 0) || 0;
    try {
      await prisma.$transaction([
        // Guarded update: only fires while still PENDING (idempotent under races).
        prisma.offerwallCompletion.updateMany({
          where: { id: c.id, status: "PENDING" },
          data: { status: "APPROVED", creditedAt: now },
        }),
        prisma.user.update({
          where: { id: c.userId },
          data: { pointsBalance: { increment: c.points }, totalEarnings: { increment: amount } },
        }),
        prisma.transaction.create({
          data: {
            userId: c.userId,
            type: "EARNING",
            status: "COMPLETED",
            points: c.points,
            amount,
            description: "Offerwall hold released",
            reference: `offerwall_hold_${c.id}`,
          },
        }),
      ]);
      released++;
    } catch {
      /* skip on conflict; picked up next run */
    }
  }
  return released;
}
