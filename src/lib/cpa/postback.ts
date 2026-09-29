import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSetting, saveSetting } from "@/lib/system-settings";
import {
  approveCpaConversion,
  claimCpaCap,
  rejectCpaConversion,
  reopenCpaConversionByPostback,
  reverseCpaConversion,
} from "@/lib/cpa/credit";
import { getCpaRetryHours } from "@/lib/cpa/eligibility";
import { cpaAttemptBoundary } from "@/lib/cpa/retry";

/**
 * CPA postbacks — the network telling us a click converted.
 *
 *   GET|POST /api/cpa/postback?click=<clickId>&txid=<id>&payout=<usd>&status=<1|approved|reversed>&sig=<hex>
 *
 * Authentication, either of:
 *   - `sig` = hex HMAC-SHA256(secret, `${click}:${txid}:${payout}`) — for
 *     networks that can sign; each field as sent, empty when absent.
 *   - `key` = the secret itself — for networks that can only call a fixed URL
 *     with macros (most CPA networks). Weaker: anyone who sees one postback URL
 *     can forge more, so prefer `sig` where the network supports it.
 * Both compare in constant time. No secret configured → every postback is
 * refused (fail closed).
 *
 * The secret lives in SystemSetting `cpa.postback_secret`; it is created the
 * first time an admin opens the postback settings (`ensureCpaPostbackSecret`),
 * never on a public request.
 */

export const CPA_POSTBACK_SECRET_KEY = "cpa.postback_secret";

export async function getCpaPostbackSecret(): Promise<string> {
  const env = process.env.CPA_POSTBACK_SECRET;
  if (env) return env;
  const v = await getSetting<string>(CPA_POSTBACK_SECRET_KEY, "");
  return typeof v === "string" ? v : "";
}

/** Admin-only: read the secret, creating it on first use. */
export async function ensureCpaPostbackSecret(): Promise<string> {
  const have = await getCpaPostbackSecret();
  if (have) return have;
  const fresh = randomBytes(24).toString("hex");
  await saveSetting(CPA_POSTBACK_SECRET_KEY, fresh, "cpa");
  return fresh;
}

/** Admin-only: replace the secret. Old postback URLs stop working at once. */
export async function rotateCpaPostbackSecret(): Promise<string> {
  const fresh = randomBytes(24).toString("hex");
  await saveSetting(CPA_POSTBACK_SECRET_KEY, fresh, "cpa");
  return fresh;
}

export function cpaSignaturePayload(click: string, txid: string, payout: string): string {
  return `${click}:${txid}:${payout}`;
}

export function signCpaPostback(secret: string, click: string, txid: string, payout: string): string {
  return createHmac("sha256", secret).update(cpaSignaturePayload(click, txid, payout)).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyCpaPostback(
  secret: string,
  p: { click: string; txid: string; payout: string; sig?: string | null; key?: string | null }
): boolean {
  if (!secret) return false;
  if (p.sig) {
    return safeEqual(p.sig.toLowerCase(), signCpaPostback(secret, p.click, p.txid, p.payout));
  }
  if (p.key) return safeEqual(p.key, secret);
  return false;
}

export function isReversalStatus(s: string | null | undefined): boolean {
  const v = (s ?? "").trim().toLowerCase();
  return ["2", "reversed", "reversal", "chargeback", "rejected", "declined", "-1"].includes(v);
}

export type PostbackOutcome =
  | "CREATED"
  | "VERIFIED"
  | "APPROVED"
  | "HELD"
  | "DUPLICATE"
  | "REVERSED"
  | "UNKNOWN_CLICK"
  | "NOTHING_TO_REVERSE"
  /** The click belongs to an earlier, already-decided attempt: ignored. */
  | "STALE_CLICK"
  /** A confirmation for the attempt an admin rejected: the rejection stands. */
  | "REJECTED_KEPT"
  /** A new attempt after the retry wait, confirmed by the network. */
  | "RETRIED";

/**
 * Process one authenticated postback. Idempotent by txid and by status CAS.
 *
 * Every interleaving with the manual path, and what it does (money moves only
 * through credit.ts, under one CAS and the `cpa_<id>` ledger reference):
 *
 *   proof first, then postback   → marks the PENDING row verified; auto-approves
 *                                  only when the offer is POSTBACK mode with
 *                                  auto-approve on (else it waits for an admin)
 *   postback first, then proof   → creates a verified PENDING row; the proof is
 *                                  attached to it later (submitCpaConversion)
 *   admin approved, then postback→ HELD/APPROVED row is only marked verified —
 *                                  no second credit (also: a postback for a new
 *                                  click on an already-APPROVED offer)
 *   reversal after approval      → reverseCpaConversion, CAS APPROVED→REVERSED,
 *                                  `cpa_rev_<id>` unique: reverses once
 *   reversal before approval     → PENDING/HELD → REJECTED (nothing was paid)
 *   same txid again              → DUPLICATE before any write
 *   postback while REJECTED      → click made before the rejection: the admin's
 *                                  decision stands (REJECTED_KEPT); click made
 *                                  after it, wait over: a new attempt (RETRIED)
 *   click from an older attempt  → STALE_CLICK, never touches the current one
 *   approve + auto-approve race  → both go through approveCpaConversion's CAS:
 *                                  one credit
 */
export async function handleCpaPostback(p: {
  click: string;
  txid: string | null;
  payout: number | null;
  reversal: boolean;
  now?: Date;
}): Promise<{ outcome: PostbackOutcome; conversionId?: string; userId?: string }> {
  const now = p.now ?? new Date();
  const click = await prisma.cpaClick.findUnique({
    where: { id: p.click },
    select: {
      id: true,
      userId: true,
      offerId: true,
      createdAt: true,
      offer: {
        select: { points: true, payoutUsd: true, autoApproveOnPostback: true, completionMode: true },
      },
    },
  });
  if (!click) return { outcome: "UNKNOWN_CLICK" };
  const userId = click.userId;

  const payoutUsd =
    p.payout != null && Number.isFinite(p.payout) && p.payout >= 0
      ? new Prisma.Decimal(p.payout)
      : click.offer.payoutUsd;

  // Two passes: a create that loses the unique race to the user's proof reads
  // the row again and verifies it instead.
  for (let pass = 0; pass < 2; pass++) {
    const existing = await prisma.cpaConversion.findUnique({
      where: { offerId_userId: { offerId: click.offerId, userId } },
      select: { id: true, status: true, txid: true, reviewedAt: true, history: true },
    });

    // A click older than the current attempt was already decided with the
    // attempt it belonged to. Neither a confirmation nor a reversal for it may
    // touch the attempt in progress now.
    const boundary = existing ? cpaAttemptBoundary(existing.history) : null;
    if (existing && boundary && click.createdAt.getTime() <= boundary.getTime()) {
      return { userId, outcome: "STALE_CLICK", conversionId: existing.id };
    }

    if (p.reversal) {
      if (!existing) return { userId, outcome: "NOTHING_TO_REVERSE" };
      if (existing.status === "APPROVED") {
        const r = await reverseCpaConversion(existing.id, null, "Reversed by the network (postback)");
        return { userId, outcome: r.ok ? "REVERSED" : "DUPLICATE", conversionId: existing.id };
      }
      if (existing.status === "PENDING" || existing.status === "HELD") {
        const r = await rejectCpaConversion(existing.id, null, "Reversed by the network (postback)");
        return { userId, outcome: r.ok ? "REVERSED" : "DUPLICATE", conversionId: existing.id };
      }
      return { userId, outcome: "DUPLICATE", conversionId: existing.id };
    }

    // A txid we have already recorded on any conversion → a replay.
    if (p.txid) {
      const seen = await prisma.cpaConversion.findUnique({
        where: { txid: p.txid },
        select: { id: true },
      });
      if (seen) return { userId, outcome: "DUPLICATE", conversionId: seen.id };
    }

    let conversionId: string;
    let capOk = true;
    let outcome: PostbackOutcome;

    if (!existing) {
      try {
        const made = await prisma.$transaction(async (tx) => {
          // A conversion the network confirmed is real either way: it is always
          // recorded. If the cap is already full the slot is still counted, but
          // the conversion is left for an admin instead of auto-approving.
          const claimed = await claimCpaCap(tx, click.offerId);
          if (!claimed) {
            await tx.cpaOffer.update({
              where: { id: click.offerId },
              data: { conversionsCount: { increment: 1 } },
            });
          }
          const c = await tx.cpaConversion.create({
            data: {
              offerId: click.offerId,
              userId,
              clickId: click.id,
              status: "PENDING",
              points: click.offer.points,
              payoutUsd,
              postbackVerified: true,
              txid: p.txid,
            },
            select: { id: true },
          });
          return { id: c.id, claimed };
        }, { timeout: 15_000, maxWait: 10_000 });
        conversionId = made.id;
        capOk = made.claimed;
        outcome = "CREATED";
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          // Either the txid (a concurrent replay — the next pass says DUPLICATE)
          // or (offerId, userId) (the user's proof landed first — verify it).
          continue;
        }
        throw e;
      }
    } else if (existing.status === "HELD" || existing.status === "APPROVED") {
      // Already decided and paid (or paying): record the confirmation, nothing else.
      const upd = await markVerified(existing.id, ["HELD", "APPROVED"], existing.txid ? null : p.txid, null, null);
      return { userId, outcome: upd === true ? "VERIFIED" : "DUPLICATE", conversionId: existing.id };
    } else if (existing.status === "REVERSED") {
      return { userId, outcome: "DUPLICATE", conversionId: existing.id };
    } else if (existing.status === "REJECTED") {
      // The click was made before the rejection → it confirms the attempt the
      // admin rejected. Admin keeps control: the rejection stands.
      const rejectedAt = existing.reviewedAt?.getTime() ?? now.getTime();
      if (click.createdAt.getTime() <= rejectedAt) {
        return { userId, outcome: "REJECTED_KEPT", conversionId: existing.id };
      }
      // A click after the rejection is a new attempt (/go/cpa only records one
      // once the wait is over; the reopen CAS checks the wait again).
      const retryHours = await getCpaRetryHours();
      const r = await reopenCpaConversionByPostback({
        conversionId: existing.id,
        userId,
        clickId: click.id,
        points: click.offer.points,
        payoutUsd,
        txid: p.txid,
        retryHours,
        now,
      });
      if (!r) return { userId, outcome: "REJECTED_KEPT", conversionId: existing.id };
      conversionId = existing.id;
      capOk = r.capOk;
      outcome = "RETRIED";
    } else {
      // PENDING — the user's proof came first (or an earlier postback).
      const upd = await markVerified(existing.id, ["PENDING"], existing.txid ? null : p.txid, payoutUsd, click.id);
      if (upd === "TXID_TAKEN") return { userId, outcome: "DUPLICATE", conversionId: existing.id };
      if (!upd) continue; // the row moved on between the read and the write
      conversionId = existing.id;
      outcome = "VERIFIED";
    }

    if (
      click.offer.completionMode === "POSTBACK" &&
      click.offer.autoApproveOnPostback &&
      capOk
    ) {
      const r = await approveCpaConversion(conversionId, null);
      if (r.ok) return { userId, outcome: r.status === "HELD" ? "HELD" : "APPROVED", conversionId };
    }
    return { userId, outcome, conversionId };
  }
  return { userId, outcome: "DUPLICATE" };
}

/**
 * Flag a conversion as confirmed by the network, only while it is still in one
 * of `statuses`. Never touches money, status or proof. Returns false when the
 * row had moved on; "TXID_TAKEN" when the txid is already on another row.
 */
async function markVerified(
  id: string,
  statuses: string[],
  txid: string | null,
  payoutUsd: Prisma.Decimal | null,
  clickId: string | null
): Promise<boolean | "TXID_TAKEN"> {
  try {
    const upd = await prisma.cpaConversion.updateMany({
      where: { id, status: { in: statuses } },
      data: {
        postbackVerified: true,
        ...(txid ? { txid } : {}),
        ...(payoutUsd != null ? { payoutUsd } : {}),
        // The click the network credited is the one that converted.
        ...(clickId ? { clickId } : {}),
      },
    });
    return upd.count > 0;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "TXID_TAKEN";
    throw e;
  }
}
