import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma, TransactionType } from "@/generated/prisma/client";
import { creditPoints, type LedgerDb } from "@/lib/ledger";
import { getPointsPerUsd } from "@/lib/economy";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { cpaRetryState, readCpaHistory, type CpaAttemptRecord } from "@/lib/cpa/retry";
import { processCpaReferralCommissions } from "@/lib/referral-commissions";
import { raiseAbuseSignal } from "@/lib/abuse/signal";

/**
 * CPA conversion money — the ONLY place a CPA conversion moves points.
 *
 * Rules this file keeps:
 *   - No points before approval. Approval flips the status with a CAS
 *     (`updateMany where status = PENDING`) and credits the ledger in the SAME
 *     transaction, so two admins (or an admin and a postback) cannot both pay.
 *   - The ledger reference is `cpa_<conversionId>`; `Transaction
 *     @@unique([userId, reference])` is the backstop if the CAS were ever
 *     bypassed. A reversal writes `cpa_rev_<conversionId>`.
 *   - Holds work like the Offerwall's: with `holdHours > 0` an approval parks
 *     the conversion as HELD with `heldUntil`, and NOTHING is credited until
 *     `releaseDueCpaHolds` (scheduler job "cpa-hold-release") pays it. Points
 *     that were never credited cannot be converted or withdrawn, so the
 *     withdrawal / convert code needs no change.
 *   - The total cap is claimed at SUBMISSION with a conditional increment and
 *     given back on rejection / reversal (and claimed again on a retry).
 *   - A REJECTED row may be reopened for a new attempt after the retry wait
 *     (`reopenRejected`). Every status CAS here also pins `attempts`, so a
 *     decision loaded for one attempt can never land on the next one. Only a
 *     REJECTED row (never credited) is ever reopened, so `cpa_<id>` is still
 *     paid at most once per row.
 *   - Transaction.amount is written from the rate here and never read back for
 *     its sign — reversal uses the absolute value of the credit row.
 */

export const CPA_REF_PREFIX = "cpa_";
export const cpaCreditRef = (conversionId: string) => `cpa_${conversionId}`;
export const cpaReversalRef = (conversionId: string) => `cpa_rev_${conversionId}`;

/** Accelerate refuses interactive transactions longer than 15s (P6005). */
const TX_OPTS = { timeout: 15_000, maxWait: 10_000 } as const;

// ── Cap ─────────────────────────────────────────────────────────────────────

/**
 * Take one slot of the offer's total cap. Atomic: the comparison
 * `conversionsCount < totalCap` is evaluated by Postgres in the UPDATE itself,
 * so two submissions racing for the last slot cannot both win.
 */
export async function claimCpaCap(db: LedgerDb, offerId: string): Promise<boolean> {
  const n = await db.$executeRaw`
    UPDATE "CpaOffer"
       SET "conversionsCount" = "conversionsCount" + 1, "updatedAt" = NOW()
     WHERE "id" = ${offerId}
       AND ("totalCap" IS NULL OR "conversionsCount" < "totalCap")`;
  return n > 0;
}

/** Give a cap slot back (rejection / reversal). Never goes below zero. */
export async function releaseCpaCap(db: LedgerDb, offerId: string): Promise<void> {
  await db.cpaOffer.updateMany({
    where: { id: offerId, conversionsCount: { gt: 0 } },
    data: { conversionsCount: { decrement: 1 } },
  });
}

/// ── Submission ──────────────────────────────────────────────────────────────

export type SubmitResult =
  | { ok: true; conversionId: string; attached: boolean; retried: boolean }
  | { ok: false; reason: "CAP" | "ALREADY" }
  | { ok: false; reason: "RETRY_LATER"; retryAt: Date };

/** What a reopen needs to know about the REJECTED row it replaces. */
const REOPEN_SELECT = {
  id: true,
  offerId: true,
  status: true,
  attempts: true,
  history: true,
  rejectionReason: true,
  reviewedAt: true,
  reviewedById: true,
  clickId: true,
  txid: true,
  postbackVerified: true,
  proofImages: true,
  proofText: true,
  createdAt: true,
} as const;

type RejectedRow = Prisma.CpaConversionGetPayload<{ select: typeof REOPEN_SELECT }>;

const CAP_FULL = "CPA_CAP_FULL";

/**
 * Reopen a REJECTED conversion as a new PENDING attempt (the retry rule — see
 * src/lib/cpa/retry.ts). Runs inside the caller's transaction:
 *
 *   - a CAS on `status = REJECTED` AND `attempts` AND a `reviewedAt` at least
 *     `retryHours` old, so two retries (a user's proof and a postback) cannot
 *     both reopen the row, and nothing reopens it before the wait is over;
 *   - the previous attempt (reason, reviewer, proof, click, txid) is appended to
 *     `history` — its txid moves there so the new attempt can record its own
 *     (a replay of the old one carries the old click and is refused as stale);
 *   - the cap slot the rejection gave back is claimed again. `forceCap` (a
 *     postback — the network says the conversion is real) counts the slot even
 *     past the cap and reports `capOk: false`, so it is left for an admin.
 *
 * Returns null when the CAS lost (the row moved on); throws CAP_FULL (rolled
 * back with the caller's transaction) when the cap is full and not forced.
 */
async function reopenRejected(
  tx: LedgerDb,
  row: RejectedRow,
  next: {
    clickId: string | null;
    proofImages: string[];
    proofText: string | null;
    points: number;
    payoutUsd: Prisma.Decimal | number | null;
    postbackVerified: boolean;
    txid: string | null;
  },
  by: "user" | "postback",
  retryHours: number,
  now: Date,
  forceCap: boolean
): Promise<{ capOk: boolean } | null> {
  const prev: CpaAttemptRecord = {
    attempt: row.attempts,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedById: row.reviewedById,
    clickId: row.clickId,
    txid: row.txid,
    postbackVerified: row.postbackVerified,
    proofImages: row.proofImages,
    proofText: row.proofText,
    submittedAt: row.createdAt.toISOString(),
    retriedAt: now.toISOString(),
    retriedBy: by,
  };
  const history = [...readCpaHistory(row.history), prev];
  const waitedSince = new Date(now.getTime() - Math.max(0, retryHours) * 3_600_000);
  const moved = await tx.cpaConversion.updateMany({
    where: {
      id: row.id,
      status: "REJECTED",
      attempts: row.attempts,
      reviewedAt: { lte: waitedSince },
    },
    data: {
      status: "PENDING",
      attempts: { increment: 1 },
      history: history as unknown as Prisma.InputJsonValue,
      clickId: next.clickId,
      proofImages: next.proofImages,
      proofText: next.proofText,
      points: Math.max(0, Math.floor(next.points)),
      payoutUsd: next.payoutUsd ?? null,
      postbackVerified: next.postbackVerified,
      txid: next.txid,
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
      heldUntil: null,
      creditedAt: null,
      reversedAt: null,
      // A new attempt is a new submission: it sorts as new in the review queue
      // and counts toward today's daily cap.
      createdAt: now,
    },
  });
  if (moved.count === 0) return null;
  if (await claimCpaCap(tx, row.offerId)) return { capOk: true };
  if (!forceCap) throw new Error(CAP_FULL);
  await tx.cpaOffer.update({
    where: { id: row.offerId },
    data: { conversionsCount: { increment: 1 } },
  });
  return { capOk: false };
}

/** The retry audit row. Best-effort: the reopen already stands. */
async function auditRetry(userId: string, row: RejectedRow, by: "user" | "postback"): Promise<void> {
  try {
    const { writeAudit } = await import("@/lib/audit");
    await writeAudit({
      actorId: by === "user" ? userId : null,
      action: "CPA_CONVERSION_RETRIED",
      entity: "CpaConversion",
      entityId: row.id,
      targetUserId: userId,
      summary: `CPA offer retried after a rejection (attempt ${row.attempts + 1}${
        by === "postback" ? ", confirmed by postback" : ""
      })`,
      meta: {
        previousAttempt: row.attempts,
        previousReason: row.rejectionReason,
        previousReviewedAt: row.reviewedAt,
        previousReviewedById: row.reviewedById,
        by,
      },
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Record a user's proof. Creates the PENDING conversion and claims the cap in
 * one transaction (a duplicate rolls the cap claim back with it). If a signed
 * postback already created the conversion and it is still PENDING with no
 * proof, the proof is attached to it instead — that conversion already holds
 * its cap slot, and keeps `postbackVerified`/`txid`. A REJECTED conversion is
 * reopened for a new attempt once the retry wait is over (`RETRY_LATER` with
 * the time until then).
 */
export async function submitCpaConversion(args: {
  offerId: string;
  userId: string;
  points: number;
  payoutUsd: Prisma.Decimal | number | null;
  clickId: string | null;
  proofImages: string[];
  proofText: string | null;
  retryHours: number;
  now?: Date;
}): Promise<SubmitResult> {
  const now = args.now ?? new Date();
  // Two passes: a create that loses the unique race to a postback re-reads the
  // row and attaches the proof to it instead of answering ALREADY.
  for (let pass = 0; pass < 2; pass++) {
    const existing = await prisma.cpaConversion.findUnique({
      where: { offerId_userId: { offerId: args.offerId, userId: args.userId } },
      select: REOPEN_SELECT,
    });
    if (existing) {
      const empty = existing.proofImages.length === 0 && !existing.proofText;
      if (existing.status === "PENDING" && empty) {
        const upd = await prisma.cpaConversion.updateMany({
          where: { id: existing.id, status: "PENDING", attempts: existing.attempts },
          data: { proofImages: args.proofImages, proofText: args.proofText },
        });
        if (upd.count > 0) return { ok: true, conversionId: existing.id, attached: true, retried: false };
        continue;
      }
      if (existing.status === "REJECTED") {
        const state = cpaRetryState(existing, args.retryHours, now);
        if (!state.ready) return { ok: false, reason: "RETRY_LATER", retryAt: state.retryAt };
        try {
          const r = await prisma.$transaction(
            (tx) =>
              reopenRejected(
                tx,
                existing,
                {
                  clickId: args.clickId,
                  proofImages: args.proofImages,
                  proofText: args.proofText,
                  points: args.points,
                  payoutUsd: args.payoutUsd,
                  postbackVerified: false,
                  txid: null,
                },
                "user",
                args.retryHours,
                now,
                false
              ),
            TX_OPTS
          );
          if (!r) continue; // the row moved on — read it again
          await auditRetry(args.userId, existing, "user");
          return { ok: true, conversionId: existing.id, attached: false, retried: true };
        } catch (e) {
          if (e instanceof Error && e.message === CAP_FULL) return { ok: false, reason: "CAP" };
          throw e;
        }
      }
      // PENDING with proof, HELD, APPROVED, REVERSED: final for the user.
      return { ok: false, reason: "ALREADY" };
    }

    try {
      return await prisma.$transaction(async (tx) => {
        if (!(await claimCpaCap(tx, args.offerId))) {
          return { ok: false as const, reason: "CAP" as const };
        }
        const c = await tx.cpaConversion.create({
          data: {
            offerId: args.offerId,
            userId: args.userId,
            clickId: args.clickId,
            status: "PENDING",
            proofImages: args.proofImages,
            proofText: args.proofText,
            points: Math.max(0, Math.floor(args.points)),
            payoutUsd: args.payoutUsd ?? null,
          },
          select: { id: true },
        });
        return { ok: true as const, conversionId: c.id, attached: false, retried: false };
      }, TX_OPTS);
    } catch (e) {
      // Lost the unique race (usually to a postback): read the row again.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { ok: false, reason: "ALREADY" };
}

/**
 * The postback's reopen: a signed postback for a click made AFTER the
 * rejection (the user pressed Start again once the wait was over) is a new
 * attempt the network confirms. Same CAS as a user retry; the cap slot is
 * always counted (the conversion is real) and `capOk: false` means it waits
 * for an admin. Null = not reopened (not REJECTED, wait not over, CAS lost).
 */
export async function reopenCpaConversionByPostback(args: {
  conversionId: string;
  userId: string;
  clickId: string;
  points: number;
  payoutUsd: Prisma.Decimal | number | null;
  txid: string | null;
  retryHours: number;
  now?: Date;
}): Promise<{ capOk: boolean } | null> {
  const now = args.now ?? new Date();
  const row = await prisma.cpaConversion.findUnique({
    where: { id: args.conversionId },
    select: REOPEN_SELECT,
  });
  if (!row || row.status !== "REJECTED") return null;
  const r = await prisma.$transaction(
    (tx) =>
      reopenRejected(
        tx,
        row,
        {
          clickId: args.clickId,
          proofImages: [],
          proofText: null,
          points: args.points,
          payoutUsd: args.payoutUsd,
          postbackVerified: true,
          txid: args.txid,
        },
        "postback",
        args.retryHours,
        now,
        true
      ),
    TX_OPTS
  );
  if (r) await auditRetry(args.userId, row, "postback");
  return r;
}

// ── Approval / hold / release ───────────────────────────────────────────────

export type ApproveResult =
  | { ok: true; status: "APPROVED" | "HELD"; points: number; userId: string; heldUntil?: Date }
  | { ok: false; reason: "NOT_FOUND" | "NOT_PENDING" };

interface ConvRow {
  id: string;
  userId: string;
  offerId: string;
  points: number;
  status: string;
  attempts: number;
  offer: { title: string; holdHours: number };
}

async function loadConv(id: string): Promise<ConvRow | null> {
  return prisma.cpaConversion.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      offerId: true,
      points: true,
      status: true,
      attempts: true,
      offer: { select: { title: true, holdHours: true } },
    },
  });
}

/** Credit a conversion's points under its one ledger reference. */
async function creditConversion(
  tx: LedgerDb,
  c: ConvRow,
  rate: number
): Promise<void> {
  await creditPoints(tx, {
    userId: c.userId,
    points: c.points,
    type: TransactionType.EARNING,
    description: `CPA offer: ${c.offer.title}`,
    reference: cpaCreditRef(c.id),
    metadata: { kind: "cpa_conversion", conversionId: c.id, offerId: c.offerId },
    pointsPerUsd: rate,
  });
}

/** After-commit niceties. Never throw; never block the money path. */
async function afterCredit(c: ConvRow): Promise<void> {
  // My Team commission — only when the admin switched CPA on in the referral
  // commission sources (off by default: CPA never paid commission). Keyed on
  // the conversion, so a second call (release retry, race) pays nothing more.
  try {
    await processCpaReferralCommissions(c.userId, c.points, c.id, c.offerId);
  } catch {
    /* best-effort — it never throws, but the payout has already landed */
  }
  try {
    const { notifyUser } = await import("@/lib/notify");
    await notifyUser({
      userId: c.userId,
      title: "Offer approved ✅",
      message: `"${c.offer.title}" was approved — ${c.points.toLocaleString()} points added.`,
      link: "/cpa",
    });
  } catch {
    /* best-effort */
  }
  try {
    const { runAchievementCheck } = await import("@/lib/achievements");
    await runAchievementCheck(c.userId);
  } catch {
    /* best-effort */
  }
}

/**
 * Approve a PENDING conversion. With a hold on the offer it becomes HELD and is
 * paid later by `releaseDueCpaHolds`; otherwise it is paid now.
 * `reviewerId` null = a system approval (auto-approve on postback).
 */
export async function approveCpaConversion(
  id: string,
  reviewerId: string | null,
  now: Date = new Date()
): Promise<ApproveResult> {
  const c = await loadConv(id);
  if (!c) return { ok: false, reason: "NOT_FOUND" };
  if (c.status !== "PENDING") return { ok: false, reason: "NOT_PENDING" };

  const holdHours = Math.max(0, c.offer.holdHours || 0);
  if (holdHours > 0 && c.points > 0) {
    const heldUntil = new Date(now.getTime() + holdHours * 3_600_000);
    const moved = await prisma.cpaConversion.updateMany({
      where: { id, status: "PENDING", attempts: c.attempts },
      data: { status: "HELD", heldUntil, reviewedById: reviewerId, reviewedAt: now },
    });
    if (moved.count === 0) return { ok: false, reason: "NOT_PENDING" };
    return { ok: true, status: "HELD", points: c.points, userId: c.userId, heldUntil };
  }

  const rate = await getPointsPerUsd();
  try {
    const paid = await prisma.$transaction(async (tx) => {
      const moved = await tx.cpaConversion.updateMany({
        where: { id, status: "PENDING", attempts: c.attempts },
        data: { status: "APPROVED", creditedAt: now, reviewedById: reviewerId, reviewedAt: now },
      });
      if (moved.count === 0) return false;
      await creditConversion(tx, c, rate);
      return true;
    }, TX_OPTS);
    if (!paid) return { ok: false, reason: "NOT_PENDING" };
  } catch (e) {
    // The ledger row already exists → it was paid by another path. The status
    // flip rolled back with the failed insert, so nothing moved here.
    if (isDuplicateLedgerError(e)) return { ok: false, reason: "NOT_PENDING" };
    throw e;
  }
  await afterCredit(c);
  return { ok: true, status: "APPROVED", points: c.points, userId: c.userId };
}

/** Pay ONE held conversion whose hold has elapsed. False = nothing to do. */
export async function releaseHeldCpaConversion(id: string, now = new Date()): Promise<boolean> {
  const c = await loadConv(id);
  if (!c || c.status !== "HELD") return false;
  const rate = await getPointsPerUsd();
  try {
    const paid = await prisma.$transaction(async (tx) => {
      const moved = await tx.cpaConversion.updateMany({
        where: { id, status: "HELD", heldUntil: { lte: now }, attempts: c.attempts },
        data: { status: "APPROVED", creditedAt: now },
      });
      if (moved.count === 0) return false;
      await creditConversion(tx, c, rate);
      return true;
    }, TX_OPTS);
    if (paid) await afterCredit(c);
    return paid;
  } catch (e) {
    if (isDuplicateLedgerError(e)) return false;
    console.error(`[cpa] hold release failed for conversion ${id}:`, e);
    return false;
  }
}

/** Release every held conversion that is due. Safe to run twice. */
export async function releaseDueCpaHolds(
  now = new Date()
): Promise<{ candidates: number; released: number }> {
  const due = await prisma.cpaConversion.findMany({
    where: { status: "HELD", heldUntil: { lte: now } },
    select: { id: true },
    orderBy: { heldUntil: "asc" },
    take: 500,
  });
  let released = 0;
  for (const d of due) {
    if (await releaseHeldCpaConversion(d.id, now)) released++;
  }
  return { candidates: due.length, released };
}

// ── Rejection / reversal ────────────────────────────────────────────────────

export type RejectResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "NOT_FOUND" | "NOT_REJECTABLE" };

/**
 * Reject a PENDING or HELD conversion (nothing was credited to either) and give
 * its cap slot back.
 */
export async function rejectCpaConversion(
  id: string,
  reviewerId: string | null,
  reason: string,
  now = new Date()
): Promise<RejectResult> {
  const c = await prisma.cpaConversion.findUnique({
    where: { id },
    select: { id: true, userId: true, offerId: true, status: true },
  });
  if (!c) return { ok: false, reason: "NOT_FOUND" };
  const done = await prisma.$transaction(async (tx) => {
    const moved = await tx.cpaConversion.updateMany({
      where: { id, status: { in: ["PENDING", "HELD"] } },
      data: {
        status: "REJECTED",
        rejectionReason: reason.slice(0, 1000),
        reviewedById: reviewerId,
        reviewedAt: now,
        heldUntil: null,
      },
    });
    if (moved.count === 0) return false;
    await releaseCpaCap(tx, c.offerId);
    return true;
  }, TX_OPTS);
  if (!done) return { ok: false, reason: "NOT_REJECTABLE" };
  return { ok: true, userId: c.userId };
}

export type ReverseResult =
  | { ok: true; userId: string; owed: number; clawedBack: number }
  | { ok: false; reason: "NOT_FOUND" | "NOT_APPROVED" };

/**
 * Take back an APPROVED conversion (network chargeback, fraud found later).
 *
 * The clawback is clamped to the balance the user still has — a negative
 * `pointsBalance` breaks every `gte` guard downstream — and the shortfall is
 * recorded on the ledger row. `totalEarnings` is lowered by what the credit
 * added (the absolute value of the credit row, never trusting its sign),
 * clamped at zero.
 */
export async function reverseCpaConversion(
  id: string,
  reviewerId: string | null,
  reason: string,
  now = new Date()
): Promise<ReverseResult> {
  const c = await prisma.cpaConversion.findUnique({
    where: { id },
    select: { id: true, userId: true, offerId: true, status: true, points: true },
  });
  if (!c) return { ok: false, reason: "NOT_FOUND" };
  if (c.status !== "APPROVED") return { ok: false, reason: "NOT_APPROVED" };

  try {
    const r = await prisma.$transaction(async (tx) => {
      const moved = await tx.cpaConversion.updateMany({
        where: { id, status: "APPROVED" },
        data: {
          status: "REVERSED",
          reversedAt: now,
          rejectionReason: reason.slice(0, 1000),
          reviewedById: reviewerId,
          reviewedAt: now,
        },
      });
      if (moved.count === 0) return null;

      const credit = await tx.transaction.findUnique({
        where: { userId_reference: { userId: c.userId, reference: cpaCreditRef(c.id) } },
        select: { points: true, amount: true },
      });
      const owed = Math.abs(credit?.points ?? c.points);
      const usd = Math.abs(Number(credit?.amount ?? 0)) || 0;
      const holder = await tx.user.findUnique({
        where: { id: c.userId },
        select: { pointsBalance: true, totalEarnings: true },
      });
      const clawedBack = Math.max(0, Math.min(holder?.pointsBalance ?? 0, owed));
      const earnBack = Math.max(0, Math.min(Number(holder?.totalEarnings ?? 0), usd));

      await tx.user.update({
        where: { id: c.userId },
        data: {
          pointsBalance: { decrement: clawedBack },
          totalEarnings: { decrement: earnBack },
        },
      });
      await tx.transaction.create({
        data: {
          userId: c.userId,
          type: TransactionType.EARNING,
          status: "COMPLETED",
          points: -clawedBack,
          amount: -earnBack,
          description: "CPA offer reversed",
          reference: cpaReversalRef(c.id),
          metadata: {
            kind: "cpa_reversal",
            conversionId: c.id,
            offerId: c.offerId,
            owed,
            clawedBack,
            shortfall: owed - clawedBack,
          },
        },
      });
      await releaseCpaCap(tx, c.offerId);
      return { owed, clawedBack };
    }, TX_OPTS);
    if (!r) return { ok: false, reason: "NOT_APPROVED" };
    // A chargeback is an abuse signal too: one case per account while open.
    raiseAbuseSignal({
      kind: "FRAUD_PATTERN",
      severity: "MEDIUM",
      userId: c.userId,
      entityType: "cpa",
      summary: `CPA conversion reversed: ${reason.slice(0, 160)}`,
      evidence: { conversionId: c.id, offerId: c.offerId, reviewerId, owed: r.owed, clawedBack: r.clawedBack },
    });
    return { ok: true, userId: c.userId, ...r };
  } catch (e) {
    if (isDuplicateLedgerError(e)) return { ok: false, reason: "NOT_APPROVED" };
    throw e;
  }
}
