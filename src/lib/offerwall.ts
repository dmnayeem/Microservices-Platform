// Internal offerwall catalog helpers: provider-config parsing, tracking-URL
// (subid) building, USD→points, country filtering, and per-category sequential
// unlock. Server-only (imports prisma). Mirrors task-sequence.ts for unlocks.
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { isDuplicateLedgerError } from "@/lib/idempotency";

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

/** Hard ceiling on the per-provider reward multiplier. See `parseOfferwallConfig`. */
export const MAX_REWARD_MULTIPLIER = 10;

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
    // Clamped at both ends. This multiplies the provider's payout into points
    // with no per-completion ceiling and no daily cap downstream, so an admin
    // typing `100` meaning "100%" would pay every single completion 100× out of
    // the treasury, silently. 10× is already a generous promotional band.
    rewardMultiplier: Math.min(
      MAX_REWARD_MULTIPLIER,
      Math.max(0, num(c.rewardMultiplier, 1))
    ),
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
 * Credit ONE held completion and flip it PENDING→APPROVED.
 *
 * **This is the only place a held completion is paid.** The release cron and the
 * admin callback queue both used to credit the same hold — the cron under
 * `offerwall_hold_<completionId>`, the admin under the callback's own id — and
 * because the two references differ, the ledger's unique constraint never
 * noticed. Approving a held offer in the admin queue paid it a second time.
 * Both callers now come through here, so they share the status CAS *and* the
 * reference, and are idempotent against each other in either order.
 *
 * Returns false when there was nothing to release (already credited, or the
 * completion moved on).
 */
export async function releaseHeldCompletion(
  completionId: string,
  now = new Date()
): Promise<boolean> {
  const c = (await prisma.offerwallCompletion.findUnique({
    where: { id: completionId },
    select: { id: true, userId: true, points: true, payoutUsd: true, status: true },
  })) as {
    id: string;
    userId: string;
    points: number;
    payoutUsd: unknown;
    status: string;
  } | null;
  if (!c || c.status !== "PENDING") return false;

  const amount = Number(c.payoutUsd ?? 0) || 0;
  try {
    return await prisma.$transaction(async (tx) => {
      // Guarded: only fires while still PENDING, so two releasers race safely.
      const claimed = await tx.offerwallCompletion.updateMany({
        where: { id: c.id, status: "PENDING" },
        data: { status: "APPROVED", creditedAt: now },
      });
      if (claimed.count === 0) return false;

      await tx.user.update({
        where: { id: c.userId },
        data: {
          pointsBalance: { increment: c.points },
          totalEarnings: { increment: amount },
        },
      });
      await tx.transaction.create({
        data: {
          userId: c.userId,
          type: "EARNING",
          status: "COMPLETED",
          points: c.points,
          amount,
          description: "Offerwall hold released",
          reference: `offerwall_hold_${c.id}`,
        },
      });
      return true;
    });
  } catch (err) {
    // A concurrent release won the ledger row. Nothing moved here.
    if (isDuplicateLedgerError(err)) return false;
    // Anything else is a real failure and must not be mistaken for "nothing
    // due" — the old bare `catch {}` swallowed connection and constraint
    // errors identically, with no log.
    console.error(`[offerwall] release failed for completion ${c.id}:`, err);
    return false;
  }
}

/**
 * Release every held completion whose hold window has passed. Held completions
 * are the only PENDING ones with a non-null `heldUntil`; proof completions
 * (heldUntil null) are left for admin review.
 */
export async function releaseHeldOfferwallCompletions(now = new Date()): Promise<number> {
  const due = await prisma.offerwallCompletion.findMany({
    where: { status: "PENDING", heldUntil: { not: null, lte: now } },
    select: { id: true },
    take: 500,
  });

  let released = 0;
  for (const c of due) {
    if (await releaseHeldCompletion(c.id, now)) released++;
  }
  return released;
}
