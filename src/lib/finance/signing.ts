import { deriveSource, type SourceKey } from "@/lib/tx-sources";

/**
 * One rule for reading the sign and the meaning of a ledger row.
 *
 * `Transaction` is a per-user wallet ledger, not a double-entry journal, and its
 * conventions drifted across the ~48 code paths that write to it:
 *
 * - **`PURCHASE` is positive for subscriptions and negative everywhere else.**
 *   `packages/purchase` stores `amount: +total`; marketplace, course and
 *   task-funding all store `amount: -price`. A plain
 *   `SUM(amount) WHERE type='PURCHASE'` nets those against each other and
 *   produces a number that means nothing.
 * - **`ADMIN_FEE` is stored negative** (it is a charge on the payer) while being
 *   platform *income*. `/admin/finance` labels it `kind: "in"` and then shows
 *   the negative sum.
 * - **`POINTS_CONVERSION` carries both units on one row** with opposite meaning:
 *   `points: -N` and `amount: +usd`. It is not income; it is the same money
 *   changing shape.
 * - **`creditPoints()` always writes positive** `points` and `amount`
 *   regardless of direction, because `amount` there is a USD *mirror* of a
 *   points credit rather than a cash movement.
 * - **`EARNING` means two different things.** Task/offerwall/social credits are
 *   money the platform pays out; marketplace `EARNING` rows are a seller
 *   receiving another user's money, which costs the platform nothing.
 * - **`CHECKIN` is never written.** Check-ins are `EARNING` with a `daily_`
 *   reference, so anything keyed on the enum reports check-in cost as zero.
 * - **Offerwall `amount` is the NETWORK's payout to the platform**, not the
 *   user's point value in USD — a third meaning inside the same `EARNING`
 *   bucket.
 *
 * Every finance figure goes through here so those rules are written once and
 * tested once, rather than re-derived per report.
 */

export type Direction =
  /** The platform pays: a real cost. */
  | "cost"
  /** The platform receives: real revenue. */
  | "revenue"
  /** Money moves between users, or changes shape. Nets to zero for the house. */
  | "internal";

export interface LedgerRow {
  type: string;
  status?: string | null;
  reference?: string | null;
  amount: number;
  points: number;
}

/** Sources that are user-to-user or shape-changing, never house money. */
const INTERNAL_SOURCES = new Set<SourceKey>([
  "marketplace", // buyer pays seller; the house fee is on MarketplacePurchase
  "convert", // points → cash, same money in a different unit
  "adcredit", // wallet cash → ad credit; revenue lands when the credit is SPENT
]);

/**
 * What a row means for the platform's own money.
 *
 * `deriveSource()` does the reference-prefix work (marketplace vs task inside
 * `EARNING`, `daily_` for check-in), so this only has to decide direction.
 */
export function direction(row: LedgerRow): Direction {
  const source = deriveSource(row.type, row.reference);
  if (INTERNAL_SOURCES.has(source)) return "internal";

  switch (row.type) {
    // Real money arriving from outside, or the platform's own take.
    case "DEPOSIT":
      // Funding a wallet is a liability, not revenue — the user can withdraw it
      // again. Counted as internal so it never inflates income.
      return "internal";
    case "ADMIN_FEE":
      return "revenue";

    // The platform paying users.
    case "EARNING":
    case "BONUS":
    case "REFERRAL":
    case "AFFILIATE_COMMISSION":
    case "LOTTERY_WIN":
    case "CHECKIN":
    case "GIFT":
      return "cost";

    // Users paying the platform.
    case "PURCHASE":
    case "COURSE_PURCHASE":
      return "revenue";

    // A tutor's share is the platform passing on money it collected.
    case "COURSE_TUTOR_EARNING":
      return "internal";

    // Reversals.
    case "REFUND":
    case "COURSE_REFUND":
      return "internal";
    case "PENALTY":
      // Clawing back a credit reduces cost rather than earning anything.
      return "cost";

    // Cash leaving the platform for good.
    case "WITHDRAWAL":
      return "internal";

    default:
      return "internal";
  }
}

/**
 * The row's USD magnitude, always positive.
 *
 * Direction is decided by `direction()`, never by the stored sign — the stored
 * sign is inconsistent (see the module comment) and cannot be trusted.
 */
export function magnitudeUsd(row: LedgerRow): number {
  const n = Number(row.amount ?? 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** The same, for the points column. */
export function magnitudePoints(row: LedgerRow): number {
  const n = Number(row.points ?? 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * A signed USD value for a running-total or net chart: revenue positive, cost
 * negative, internal zero.
 *
 * Deliberately zero for internal rows rather than their magnitude — a chart of
 * platform money must not move when a user pays another user.
 */
export function signedUsd(row: LedgerRow): number {
  const d = direction(row);
  if (d === "internal") return 0;
  const mag = magnitudeUsd(row);
  return d === "revenue" ? mag : -mag;
}

/**
 * Is this row settled money?
 *
 * `WITHDRAWAL` rows sit at `PENDING` while the cash has ALREADY left the user's
 * wallet (it is debited at request time), so a report that filters on
 * `COMPLETED` alone loses them entirely. Callers that care about wallet
 * liability must include pending withdrawals; callers measuring settled revenue
 * should not.
 */
export function isSettled(row: LedgerRow): boolean {
  return (row.status ?? "COMPLETED") === "COMPLETED";
}

/** The source bucket a row belongs to, for grouping and colouring. */
export function sourceOf(row: LedgerRow): SourceKey {
  return deriveSource(row.type, row.reference);
}

/**
 * Rows whose `amount` does not mean "USD value of this movement".
 *
 * Offerwall credits store the NETWORK's payout to the platform in `amount`
 * while `points` holds what the user actually received. Summing them alongside
 * task payouts produces a cost figure that is neither one thing nor the other,
 * so cost reports use `points / pointsPerUsd` for these instead.
 */
export function amountIsUserValue(row: LedgerRow): boolean {
  return !(row.reference ?? "").toLowerCase().startsWith("offerwall");
}
