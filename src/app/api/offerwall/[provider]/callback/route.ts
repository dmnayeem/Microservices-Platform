import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import {
  parseOfferwallConfig,
  clawbackOfferwallReferrals,
  offerDayStart,
} from "@/lib/offerwall";
import { processOfferwallReferralCommissions } from "@/lib/referral-commissions";
import { raiseAbuseSignal } from "@/lib/abuse/signal";
import {
  parseSignatureConfig,
  providedSignature,
  verifyPostbackSignature,
} from "@/lib/offerwall-providers/postback-signature";

/**
 * Generic offerwall server-to-server postback. Provider-agnostic:
 *   /api/offerwall/<provider>/callback?transactionId=..&userId=..&userPayout=..&payoutAmount=..&signature=..
 * Verifies the postback signature with the provider's scheme (chosen per
 * provider in /admin/offerwalls — see offerwall-providers/postback-signature.ts;
 * default is our HMAC-SHA256), credits the user exactly once, and either
 * auto-credits or queues for admin review per config.autoCredit. Degrades to
 * 403/400 when the provider is not configured — never crashes.
 */
interface RouteParams {
  params: Promise<{ provider: string }>;
}

// Interactive transactions: Accelerate rejects anything past 15s.
const TX_OPTS = { timeout: 15_000, maxWait: 10_000 } as const;

function pick(url: URL, body: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = url.searchParams.get(k) ?? body[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

/** Thrown inside a credit transaction to abort it with a reason (no rows written). */
class Skip extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

async function handle(request: NextRequest, provider: string) {
  const config = await prisma.offerwallConfig.findUnique({ where: { provider } });
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "Offerwall not configured" }, { status: 403 });
  }
  if (!config.secretKey) {
    return NextResponse.json({ error: "Signature secret not configured" }, { status: 400 });
  }

  const url = new URL(request.url);
  let body: Record<string, string> = {};
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) body = await request.json();
    else if (ct.includes("form")) {
      const fd = await request.formData();
      body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    }
  } catch {
    /* query-only providers */
  }
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...Object.fromEntries(url.searchParams), ...body })) {
    if (v != null) params[k] = String(v);
  }

  const transactionId = pick(url, body, "transactionId", "transaction_id", "trans_id", "tx_id", "transactionID", "txid");
  const userId = pick(url, body, "userId", "user_id", "userID", "uid", "subId", "sub_id", "s1");
  const sigCfg = parseSignatureConfig(config.config);
  const signature = providedSignature(sigCfg, params);
  const payoutAmount = Number(pick(url, body, "payoutAmount", "payout", "amount", "revenue")) || 0;
  const pointsPerUsd = await getPointsPerUsd();
  let userPayout = Math.round(Number(pick(url, body, "userPayout", "points", "currency_amount", "currencyReward", "reward")) || 0);
  if (userPayout <= 0 && payoutAmount > 0) {
    userPayout = Math.round(payoutAmount * pointsPerUsd);
  }
  const offerId = pick(url, body, "offerId", "offer_id") || null;
  const offerName = pick(url, body, "offerName", "offer_name") || null;
  // Our click id (subid) is echoed back so we can resolve the internal offer.
  const clickId = pick(url, body, "clickId", "click_id", "s2", "sub2", "aff_sub2") || null;
  const state = pick(url, body, "state", "status", "type").toLowerCase();
  const isReversal = /reject|revers|chargeback|declin/.test(state) || payoutAmount < 0;
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;

  if (!transactionId || !userId) {
    return NextResponse.json({ error: "Missing transactionId/userId" }, { status: 400 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // The legacy/default scheme is an HMAC over ALL money-bearing fields (incl.
  // payoutAmount); network presets use the network's own documented scheme.
  const ok = verifyPostbackSignature(sigCfg, {
    secret: config.secretKey,
    url,
    params,
    legacy: { transactionId, userId, userPayout, payoutAmount },
  });
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }
  // A suspended/banned account is never auto-paid: its completion is held for
  // an admin instead (it can still be reversed).
  const userActive = user.status === "ACTIVE";

  const pcfg = parseOfferwallConfig(config.config);
  const multiplier = pcfg.rewardMultiplier || 1;
  // Test mode always queues (no credit) so integrations can be QA'd safely.
  const autoCredit = pcfg.autoCredit && !pcfg.testMode;
  const rawPayload = JSON.parse(JSON.stringify(params));
  /** USD value of `points` as the USER earned it (what totalEarnings tracks). */
  const usdOf = (points: number) => (pointsPerUsd > 0 ? points / pointsPerUsd : 0);

  // Resolve an internal catalog offer/completion from our click id (subid).
  type Comp = { id: string; userId: string; offerId: string; points: number; status: string; createdAt: Date };
  let completion: Comp | null = null;
  let internalOfferId: string | null = null;
  let holdHours = 0;
  let dailyLimit: number | null = null;
  if (clickId) {
    const click = (await prisma.offerwallClick.findUnique({ where: { id: clickId } })) as
      | { userId: string; offerId: string }
      | null;
    if (click) {
      internalOfferId = click.offerId;
      const offer = (await prisma.offerwallOffer.findUnique({
        where: { id: click.offerId },
        select: { holdHours: true, dailyLimit: true },
      })) as { holdHours: number; dailyLimit: number | null } | null;
      holdHours = offer?.holdHours ?? 0;
      dailyLimit = offer?.dailyLimit ?? null;
      completion = (await prisma.offerwallCompletion.findFirst({
        where: { userId: click.userId, offerId: click.offerId, clickId },
        orderBy: { createdAt: "desc" },
        select: { id: true, userId: true, offerId: true, points: true, status: true, createdAt: true },
      })) as Comp | null;
    }
  }

  const now = new Date();

  try {
    // ── Reversal / chargeback ──
    if (isReversal) {
      // A legacy (no click id) credit has no completion row — the credited
      // callback itself is the record. Without this lookup a legacy chargeback
      // was logged and nothing was ever taken back.
      const orig = completion
        ? null
        : await prisma.offerwallCallback.findUnique({
            where: { transactionId },
            select: { id: true, userId: true, userPayout: true, status: true },
          });
      const legacyTarget =
        orig && orig.status === "APPROVED" && orig.userId === userId ? orig : null;
      const back = Math.abs(userPayout) || completion?.points || legacyTarget?.userPayout || 0;

      const r = await prisma.$transaction(async (tx) => {
        // First: the reversal record. Networks usually send the chargeback
        // under the SAME transaction id as the credit, so it is namespaced
        // (`rev_`) to stay distinct from the credit yet still dedupe a
        // replayed reversal (P2002 → nothing below runs).
        await tx.offerwallCallback.create({
          data: {
            userId, offerwallId: config.id, offerId, offerName,
            transactionId: `rev_${transactionId}`,
            payoutAmount, userPayout, status: "CHARGEBACK", isReversal: true,
            internalOfferId, ipAddress: ip, processedAt: now, rawPayload,
          },
        });

        // A chargeback on a completion that was never paid (STARTED, or
        // PENDING = held / awaiting review) cancels it, so the hold release
        // and the review queue can never pay it afterwards.
        if (completion && (completion.status === "STARTED" || completion.status === "PENDING")) {
          const cancelled = await tx.offerwallCompletion.updateMany({
            where: { id: completion.id, status: { in: ["STARTED", "PENDING"] } },
            data: { status: "REVERSED", reversedAt: now, heldUntil: null, rejectionReason: "Network chargeback before payout" },
          });
          await tx.offerwallCallback.updateMany({
            where: { transactionId, status: "PENDING" },
            data: { status: "REJECTED", processedAt: now, reviewNote: "Network chargeback before payout" },
          });
          return { cancelled: cancelled.count > 0, clawUserId: null as string | null, clawedBack: 0 };
        }
        // A legacy callback still waiting in the admin queue: take it out.
        if (!completion && orig && orig.status === "PENDING" && orig.userId === userId) {
          await tx.offerwallCallback.updateMany({
            where: { id: orig.id, status: "PENDING" },
            data: { status: "REJECTED", processedAt: now, reviewNote: "Network chargeback before payout" },
          });
          return { cancelled: true, clawUserId: null as string | null, clawedBack: 0 };
        }

        // Only claw back if the completion (or legacy callback) was actually credited.
        let clawUserId: string | null = null;
        if (completion && completion.status === "APPROVED") {
          const moved = await tx.offerwallCompletion.updateMany({
            where: { id: completion.id, status: "APPROVED" },
            data: { status: "REVERSED", reversedAt: now },
          });
          if (moved.count > 0) clawUserId = completion.userId;
        } else if (!completion && legacyTarget) {
          clawUserId = legacyTarget.userId;
        }
        if (!clawUserId || back <= 0) return { cancelled: false, clawUserId, clawedBack: 0 };

        // Clamp to what the user actually has. An unclamped decrement drove
        // `pointsBalance` negative whenever the points had already been spent
        // or converted, and a negative balance breaks every `gte` guard
        // downstream. The shortfall is recorded rather than silently absorbed.
        const holder = await tx.user.findUnique({
          where: { id: clawUserId },
          select: { pointsBalance: true, totalEarnings: true },
        });
        const clawback = Math.max(0, Math.min(holder?.pointsBalance ?? 0, back));
        // The credit raised `totalEarnings` by the user's earned USD; take that
        // back (clamped at zero), not the network's payout.
        const earnBack = Math.max(0, Math.min(Number(holder?.totalEarnings ?? 0), usdOf(back)));
        await tx.user.update({
          where: { id: clawUserId },
          data: {
            pointsBalance: { decrement: clawback },
            totalEarnings: { decrement: earnBack },
          },
        });
        await tx.transaction.create({
          data: {
            userId: clawUserId, type: "EARNING", status: "COMPLETED",
            points: -clawback, amount: -Math.abs(payoutAmount),
            description: `Offerwall reversal: ${offerName ?? "offer"}`,
            reference: `offerwall_rev_${transactionId}`,
            metadata: { owed: back, clawedBack: clawback, shortfall: back - clawback },
          },
        });
        return { cancelled: false, clawUserId, clawedBack: clawback };
      }, TX_OPTS);

      if (r.clawUserId) {
        // Upline commissions paid on this completion go too (same keys the
        // credit used: completion id, or tx_<transactionId> for legacy).
        await clawbackOfferwallReferrals(
          completion ? completion.id : `tx_${transactionId}`,
          `offerwall chargeback (${offerName ?? "offer"})`
        );
        raiseAbuseSignal({
          kind: "FRAUD_PATTERN",
          severity: "MEDIUM",
          userId: r.clawUserId,
          entityType: "offerwall",
          summary: `Offerwall chargeback (${provider}): ${offerName ?? "offer"}`,
          evidence: { provider, transactionId, offerId, payoutAmount, userPayout, ip },
        });
      }
      return NextResponse.json({ ok: true, reversed: r.clawedBack, cancelled: r.cancelled });
    }

    // ── Catalog offer completion (resolved via subid) ──
    //
    // A completion that is already APPROVED (or REVERSED) must never be paid
    // again. The lookup above finds a completion by (userId, offerId, clickId)
    // with NO status filter, and both dedup keys — `OfferwallCallback.transactionId`
    // and the ledger reference — are keyed on `transactionId`. So a second
    // postback for the same click carrying a NEW transaction id sailed past
    // every guard and credited the user twice. Networks that send a "pending"
    // postback followed by a "confirmed" one do exactly this as a matter of
    // course. `STARTED` is the only creditable state: PENDING is already held
    // awaiting the release cron, APPROVED is already paid, REJECTED/REVERSED
    // are terminal. The status check below is re-done as a CAS inside the
    // credit transaction so two concurrent postbacks cannot both pass it.
    const duplicate = async (comp: Comp, reason: string) => {
      await prisma.offerwallCallback.create({
        data: {
          userId: comp.userId, offerwallId: config.id, offerId, offerName,
          transactionId, payoutAmount, userPayout: comp.points,
          status: "DUPLICATE", internalOfferId, ipAddress: ip,
          processedAt: now, rawPayload,
        },
      });
      return NextResponse.json({ ok: true, credited: 0, duplicate: true, reason });
    };
    if (completion && completion.status !== "STARTED") {
      return duplicate(completion, `Completion already ${completion.status.toLowerCase()}`);
    }

    if (completion) {
      const comp = completion;
      const points = comp.points || Math.round(userPayout * multiplier);
      // Inactive accounts are held for an admin (heldUntil null = review queue).
      const held = holdHours > 0 || !userActive;
      const heldUntil = userActive ? new Date(now.getTime() + holdHours * 3600_000) : null;
      const callbackStatus = held ? "PENDING" : "APPROVED";

      try {
        await prisma.$transaction(async (tx) => {
          // Offer daily limit, enforced again at credit time: completions of
          // this offer by this user started the same UTC day (excluding this
          // one) that are already pending/paid.
          if (dailyLimit && dailyLimit > 0) {
            const dayStart = offerDayStart(comp.createdAt);
            const sameDay = await tx.offerwallCompletion.count({
              where: {
                userId: comp.userId,
                offerId: comp.offerId,
                id: { not: comp.id },
                status: { in: ["PENDING", "APPROVED"] },
                createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) },
              },
            });
            if (sameDay >= dailyLimit) {
              await tx.offerwallCompletion.updateMany({
                where: { id: comp.id, status: "STARTED" },
                data: { status: "REJECTED", txid: transactionId, rejectionReason: "Daily limit for this offer reached" },
              });
              throw new Skip("Daily limit for this offer reached");
            }
          }

          // Claim: STARTED → PENDING/APPROVED. Only one postback can win.
          const claimed = await tx.offerwallCompletion.updateMany({
            where: { id: comp.id, status: "STARTED" },
            data: held
              ? { status: "PENDING", points, txid: transactionId, heldUntil }
              : { status: "APPROVED", points, txid: transactionId, creditedAt: now },
          });
          if (claimed.count === 0) throw new Skip("Completion already processed");

          await tx.offerwallCallback.create({
            data: {
              userId: comp.userId, offerwallId: config.id, offerId, offerName,
              transactionId, payoutAmount, userPayout: points, status: callbackStatus,
              internalOfferId, ipAddress: ip, processedAt: now,
              creditedAt: held ? null : now, rawPayload,
            },
          });
          if (!held) {
            await tx.user.update({
              where: { id: comp.userId },
              data: { pointsBalance: { increment: points }, totalEarnings: { increment: usdOf(points) } },
            });
            await tx.transaction.create({
              data: {
                userId: comp.userId, type: "EARNING", status: "COMPLETED",
                points, amount: payoutAmount,
                description: `Offer: ${offerName ?? "completion"}`,
                reference: `offerwall_${transactionId}`,
              },
            });
          }
        }, TX_OPTS);
      } catch (err) {
        if (err instanceof Skip) {
          if (err.reason === "Daily limit for this offer reached") {
            await prisma.offerwallCallback.create({
              data: {
                userId: comp.userId, offerwallId: config.id, offerId, offerName,
                transactionId, payoutAmount, userPayout: points, status: "REJECTED",
                internalOfferId, ipAddress: ip, processedAt: now, rawPayload,
                reviewNote: err.reason,
              },
            });
            return NextResponse.json({ ok: true, credited: 0, rejected: true, reason: err.reason });
          }
          return duplicate(comp, err.reason);
        }
        throw err;
      }
      // My Team commission — only if the admin switched offerwall on (off by
      // default). Keyed on the completion, the same key the hold release uses,
      // so a completion pays its upline once whichever path credited it.
      if (!held && points > 0) {
        await processOfferwallReferralCommissions(comp.userId, points, comp.id, comp.offerId);
      }
      return NextResponse.json({ ok: true, credited: held ? 0 : points, held });
    }

    // ── Legacy pure-wall completion (no internal offer) ──
    const points = Math.round(userPayout * multiplier);
    // Inactive accounts go to the admin queue instead of being auto-paid.
    if (autoCredit && userActive) {
      await prisma.$transaction([
        prisma.offerwallCallback.create({
          data: {
            userId, offerwallId: config.id, offerId, offerName, transactionId,
            payoutAmount, userPayout: points, status: "APPROVED", ipAddress: ip,
            creditedAt: now, processedAt: now, rawPayload,
          },
        }),
        prisma.user.update({ where: { id: userId }, data: { pointsBalance: { increment: points }, totalEarnings: { increment: usdOf(points) } } }),
        prisma.transaction.create({
          data: {
            userId, type: "EARNING", status: "COMPLETED", points, amount: payoutAmount,
            description: `Offerwall: ${offerName ?? offerId ?? "completion"}`,
            reference: `offerwall_${transactionId}`,
          },
        }),
      ]);
      // Commission (off by default) — keyed on the network transaction, like the ledger row.
      if (points > 0 && transactionId) {
        await processOfferwallReferralCommissions(userId, points, `tx_${transactionId}`, offerId ?? null);
      }
    } else {
      await prisma.offerwallCallback.create({
        data: {
          userId, offerwallId: config.id, offerId, offerName, transactionId,
          payoutAmount, userPayout: points, status: "PENDING", ipAddress: ip, rawPayload,
        },
      });
    }
    return NextResponse.json({ ok: true, credited: autoCredit && userActive ? points : 0 });
  } catch (err) {
    // Unique violation on transactionId → provider retry; already handled.
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: "Callback failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return handle(request, provider);
}
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return handle(request, provider);
}
