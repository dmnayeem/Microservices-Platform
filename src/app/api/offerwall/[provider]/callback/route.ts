import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { parseOfferwallConfig } from "@/lib/offerwall";

/**
 * Generic offerwall server-to-server postback. Provider-agnostic:
 *   /api/offerwall/<provider>/callback?transactionId=..&userId=..&userPayout=..&payoutAmount=..&signature=..
 * Verifies an HMAC-SHA256 (or shared-secret) signature against the provider's
 * secretKey, credits the user exactly once (transactionId is unique), and either
 * auto-credits or queues for admin review per config.autoCredit. Degrades to
 * 403/400 when the provider is not configured — never crashes.
 */
interface RouteParams {
  params: Promise<{ provider: string }>;
}

function pick(url: URL, body: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = url.searchParams.get(k) ?? body[k];
    if (v != null && v !== "") return String(v);
  }
  return "";
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

  const transactionId = pick(url, body, "transactionId", "transaction_id", "trans_id");
  const userId = pick(url, body, "userId", "user_id", "subId", "sub_id", "s1");
  const signature = pick(url, body, "signature", "sig", "hash");
  const payoutAmount = Number(pick(url, body, "payoutAmount", "payout", "amount", "revenue")) || 0;
  let userPayout = Math.round(Number(pick(url, body, "userPayout", "points", "currency_amount")) || 0);
  if (userPayout <= 0 && payoutAmount > 0) {
    const pointsPerUsd = await getPointsPerUsd();
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

  // Require an HMAC over ALL money-bearing fields (incl. payoutAmount). The old
  // plaintext-secret path + amount-less HMAC let anyone with the secret credit
  // arbitrary amounts — both removed.
  const expectedHmac = crypto
    .createHmac("sha256", config.secretKey)
    .update(`${transactionId}${userId}${userPayout}${payoutAmount}`)
    .digest("hex");
  const provided = signature.toLowerCase();
  const expected = expectedHmac.toLowerCase();
  const ok =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  }

  const pcfg = parseOfferwallConfig(config.config);
  const multiplier = pcfg.rewardMultiplier || 1;
  // Test mode always queues (no credit) so integrations can be QA'd safely.
  const autoCredit = pcfg.autoCredit && !pcfg.testMode;
  const rawPayload = JSON.parse(JSON.stringify({ ...Object.fromEntries(url.searchParams), ...body }));

  // Resolve an internal catalog offer/completion from our click id (subid).
  type Comp = { id: string; userId: string; offerId: string; points: number; status: string };
  let completion: Comp | null = null;
  let internalOfferId: string | null = null;
  let holdHours = 0;
  if (clickId) {
    const click = (await prisma.offerwallClick.findUnique({ where: { id: clickId } })) as
      | { userId: string; offerId: string }
      | null;
    if (click) {
      internalOfferId = click.offerId;
      const offer = (await prisma.offerwallOffer.findUnique({
        where: { id: click.offerId },
        select: { holdHours: true },
      })) as { holdHours: number } | null;
      holdHours = offer?.holdHours ?? 0;
      completion = (await prisma.offerwallCompletion.findFirst({
        where: { userId: click.userId, offerId: click.offerId, clickId },
        orderBy: { createdAt: "desc" },
        select: { id: true, userId: true, offerId: true, points: true, status: true },
      })) as Comp | null;
    }
  }

  const now = new Date();

  try {
    // ── Reversal / chargeback ──
    if (isReversal) {
      const back = Math.abs(userPayout) || completion?.points || 0;
      const ops: unknown[] = [
        prisma.offerwallCallback.create({
          data: {
            userId, offerwallId: config.id, offerId, offerName, transactionId,
            payoutAmount, userPayout, status: "CHARGEBACK", isReversal: true,
            internalOfferId, ipAddress: ip, processedAt: now, rawPayload,
          },
        }),
      ];
      // Only claw back if the completion was actually credited.
      if (completion && completion.status === "APPROVED" && back > 0) {
        // Clamp to what the user actually has. An unclamped decrement drove
        // `pointsBalance` negative whenever the points had already been spent
        // or converted, and a negative balance breaks every `gte` guard
        // downstream. The shortfall is recorded rather than silently absorbed.
        const holder = await prisma.user.findUnique({
          where: { id: completion.userId },
          select: { pointsBalance: true },
        });
        const clawback = Math.max(0, Math.min(holder?.pointsBalance ?? 0, back));
        ops.push(
          prisma.offerwallCompletion.update({ where: { id: completion.id }, data: { status: "REVERSED", reversedAt: now } }),
          prisma.user.update({
            where: { id: completion.userId },
            data: {
              pointsBalance: { decrement: clawback },
              // The credit incremented `totalEarnings`; the reversal never did.
              // Lifetime earnings stayed inflated after every chargeback — and
              // `totalEarnings` is what the leaderboard ranks and pays on.
              totalEarnings: { decrement: Math.abs(payoutAmount) },
            },
          }),
          prisma.transaction.create({
            data: {
              userId: completion.userId, type: "EARNING", status: "COMPLETED",
              points: -clawback, amount: -Math.abs(payoutAmount),
              description: `Offerwall reversal: ${offerName ?? "offer"}`,
              reference: `offerwall_rev_${transactionId}`,
              metadata: { owed: back, clawedBack: clawback, shortfall: back - clawback },
            },
          })
        );
      }
      await prisma.$transaction(ops as never);
      return NextResponse.json({ ok: true, reversed: back });
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
    // course. (`OfferwallCompletion @@unique([providerId, txid])` never fired
    // either: the update below sets `txid` but leaves `providerId` NULL, and
    // Postgres treats NULLs as distinct.)
    // `STARTED` is the only creditable state: PENDING is already held awaiting
    // the release cron, APPROVED is already paid, REJECTED/REVERSED are terminal.
    if (completion && completion.status !== "STARTED") {
      await prisma.offerwallCallback.create({
        data: {
          userId: completion.userId, offerwallId: config.id, offerId, offerName,
          transactionId, payoutAmount, userPayout: completion.points,
          status: "DUPLICATE", internalOfferId, ipAddress: ip,
          processedAt: now, rawPayload,
        },
      });
      return NextResponse.json({
        ok: true,
        credited: 0,
        duplicate: true,
        reason: `Completion already ${completion.status.toLowerCase()}`,
      });
    }

    if (completion) {
      const points = completion.points || Math.round(userPayout * multiplier);
      const held = holdHours > 0;
      const callbackStatus = held ? "PENDING" : "APPROVED";
      const ops: unknown[] = [
        prisma.offerwallCallback.create({
          data: {
            userId: completion.userId, offerwallId: config.id, offerId, offerName,
            transactionId, payoutAmount, userPayout: points, status: callbackStatus,
            internalOfferId, ipAddress: ip, processedAt: now,
            creditedAt: held ? null : now, rawPayload,
          },
        }),
      ];
      if (held) {
        // Hold: credit later via the release cron.
        ops.push(
          prisma.offerwallCompletion.update({
            where: { id: completion.id },
            data: { status: "PENDING", points, txid: transactionId, heldUntil: new Date(now.getTime() + holdHours * 3600_000) },
          })
        );
      } else {
        ops.push(
          prisma.offerwallCompletion.update({
            where: { id: completion.id },
            data: { status: "APPROVED", points, txid: transactionId, creditedAt: now },
          }),
          prisma.user.update({ where: { id: completion.userId }, data: { pointsBalance: { increment: points }, totalEarnings: { increment: payoutAmount } } }),
          prisma.transaction.create({
            data: {
              userId: completion.userId, type: "EARNING", status: "COMPLETED",
              points, amount: payoutAmount,
              description: `Offer: ${offerName ?? "completion"}`,
              reference: `offerwall_${transactionId}`,
            },
          })
        );
      }
      await prisma.$transaction(ops as never);
      return NextResponse.json({ ok: true, credited: held ? 0 : points, held });
    }

    // ── Legacy pure-wall completion (no internal offer) ──
    const points = Math.round(userPayout * multiplier);
    if (autoCredit) {
      await prisma.$transaction([
        prisma.offerwallCallback.create({
          data: {
            userId, offerwallId: config.id, offerId, offerName, transactionId,
            payoutAmount, userPayout: points, status: "APPROVED", ipAddress: ip,
            creditedAt: now, processedAt: now, rawPayload,
          },
        }),
        prisma.user.update({ where: { id: userId }, data: { pointsBalance: { increment: points }, totalEarnings: { increment: payoutAmount } } }),
        prisma.transaction.create({
          data: {
            userId, type: "EARNING", status: "COMPLETED", points, amount: payoutAmount,
            description: `Offerwall: ${offerName ?? offerId ?? "completion"}`,
            reference: `offerwall_${transactionId}`,
          },
        }),
      ]);
    } else {
      await prisma.offerwallCallback.create({
        data: {
          userId, offerwallId: config.id, offerId, offerName, transactionId,
          payoutAmount, userPayout: points, status: "PENDING", ipAddress: ip, rawPayload,
        },
      });
    }
    return NextResponse.json({ ok: true, credited: autoCredit ? points : 0 });
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
