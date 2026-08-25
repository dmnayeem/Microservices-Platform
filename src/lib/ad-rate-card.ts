import "server-only";
import { prisma } from "@/lib/prisma";
import { getAdClickCost } from "@/lib/ad-billing";
import { toNum } from "@/lib/money";

/**
 * Per-space pricing, and the slots that have been rented outright.
 *
 * ## Why this exists
 *
 * There used to be exactly one price in the entire ad system — `ads.cpcUsd`,
 * charged for a click on any ad, in any space, of any format, to any audience.
 * `getAdClickCost()` took no arguments, which is the proof. A click on the
 * withdrawal page (the longest-dwell screen in the app) cost an advertiser the
 * same as one on a banner nobody reads.
 *
 * And selection is a pure weighted-random draw with no reference to money, so a
 * $5 campaign and a $5,000 campaign at the same weight got identical share of
 * voice. There was no way to sell "this space is yours for a month", which is
 * how a publisher this size actually earns.
 *
 * ## The two prices
 *
 * - `AdPlacement.cpcUsd` — a per-space click price. Null falls back to the
 *   global setting, so a database where nothing has been priced behaves exactly
 *   as it did before.
 * - `AdPlacement.monthlyUsd` + `isRentable` — the flat-rate sponsorship price.
 *
 * ## The invariant that must not break
 *
 * `AdDailyStat.spendUsd` and `AdCampaign.spentTotal` snapshot the price **in
 * force at the moment of the click**. That is deliberate and commented in three
 * places: reporting must never derive spend as `clicks x current CPC`, because
 * that silently rewrites history every time a rate changes. Resolving a
 * different price per space does not change that — it changes what gets
 * snapshotted, never what was.
 */

/** How long a resolved rate is cached. Rates change by hand, rarely. */
const RATE_TTL_MS = 30_000;

const rateCache = new Map<string, { at: number; cpc: number | null }>();
const bookingCache = new Map<string, { at: number; booking: ActiveBooking | null }>();

/**
 * The click price for a space, in USD.
 *
 * `placementName` is optional so every existing caller keeps working unchanged —
 * omitting it is the old global behaviour, which is exactly right for the paths
 * that price nothing in particular (the budget floor in `servableCampaignWhere`,
 * the cron's auto-pause threshold).
 */
export async function getPlacementClickCost(
  placementName?: string | null
): Promise<number> {
  const global = await getAdClickCost();
  if (!placementName) return global;

  const hit = rateCache.get(placementName);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) {
    return hit.cpc ?? global;
  }

  let cpc: number | null = null;
  try {
    // Deliberately NOT Accelerate-cached.
    //
    // The memo above is already a 30s cache, and a second one underneath it
    // means `clearRateCardCache()` no longer clears anything an admin can see:
    // they save a new rate, the memo drops, and Accelerate serves them the old
    // row anyway. One cache with one invalidation beats two with none.
    const row = await prisma.adPlacement.findFirst({
      where: { name: placementName },
      select: { cpcUsd: true },
    });
    const n = row?.cpcUsd == null ? NaN : toNum(row.cpcUsd);
    // A zero or negative override would make clicks free, and a bad row must not
    // be able to give inventory away. Same clamp the global price uses.
    cpc = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 0.001), 100) : null;
  } catch {
    // Pricing must never break serving or billing — fall back to the global.
    cpc = null;
  }
  rateCache.set(placementName, { at: Date.now(), cpc });
  return cpc ?? global;
}

/** Drop both memos — called after an admin edits a rate or a booking. */
export function clearRateCardCache(): void {
  rateCache.clear();
  bookingCache.clear();
}

export interface ActiveBooking {
  id: string;
  campaignId: string;
  exclusive: boolean;
  billClicks: boolean;
}

/**
 * The live booking on a space right now, if any.
 *
 * Only `ACTIVE` bookings whose window covers this instant count —
 * `PENDING_PAYMENT` deliberately does not, so an unpaid booking cannot take a
 * space hostage. Where two overlap (which the admin UI discourages but the
 * schema permits), the one that started most recently wins: a later sale is the
 * more recent agreement.
 */
export async function getActiveBooking(
  placementId: string,
  now: Date = new Date()
): Promise<ActiveBooking | null> {
  const hit = bookingCache.get(placementId);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.booking;

  try {
    // Not Accelerate-cached either, and here the reason is different: `now` is
    // in the predicate, so every call would be a distinct cache key and the
    // cache would never hit — it would only look like it was doing something.
    // The in-process memo above is the real one. Served by
    // @@index([placementId, status, startAt, endAt]).
    const row = await prisma.adSlotBooking.findFirst({
      where: {
        placementId,
        status: "ACTIVE",
        startAt: { lte: now },
        endAt: { gte: now },
      },
      orderBy: { startAt: "desc" },
      select: { id: true, campaignId: true, exclusive: true, billClicks: true },
    });
    const booking = row ?? null;
    bookingCache.set(placementId, { at: Date.now(), booking });
    return booking;
  } catch {
    // A booking lookup failing must not take the space down with it.
    return null;
  }
}

/**
 * Whether a click on this ad should draw down its campaign budget.
 *
 * A flat-rate sponsor has already paid for the period. Billing them per click on
 * top of that charges them twice for inventory they bought outright, which is
 * the kind of thing that ends a direct-sales relationship. `billClicks` on the
 * booking is the switch; it defaults to false for exactly this reason.
 */
export async function clicksAreBillable(
  placementId: string,
  campaignId: string
): Promise<boolean> {
  const booking = await getActiveBooking(placementId);
  if (!booking) return true;
  if (booking.campaignId !== campaignId) return true;
  return booking.billClicks;
}
