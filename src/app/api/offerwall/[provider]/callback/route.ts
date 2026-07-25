import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd } from "@/lib/economy";

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

  const cfg = (config.config as { autoCredit?: boolean; testMode?: boolean } | null) ?? {};
  // Test mode always queues (no credit) so integrations can be QA'd safely.
  const autoCredit = !!cfg.autoCredit && !cfg.testMode;

  // Idempotency: transactionId is @unique — create first, catch duplicates.
  try {
    if (autoCredit) {
      await prisma.$transaction([
        prisma.offerwallCallback.create({
          data: {
            userId,
            offerwallId: config.id,
            offerId,
            offerName,
            transactionId,
            payoutAmount,
            userPayout,
            status: "APPROVED",
            ipAddress: ip,
            creditedAt: new Date(),
            processedAt: new Date(),
            rawPayload: JSON.parse(JSON.stringify({ ...Object.fromEntries(url.searchParams), ...body })),
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            pointsBalance: { increment: userPayout },
            totalEarnings: { increment: payoutAmount },
          },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: "EARNING",
            status: "COMPLETED",
            points: userPayout,
            amount: payoutAmount,
            description: `Offerwall: ${offerName ?? offerId ?? "completion"}`,
            reference: `offerwall_${transactionId}`,
          },
        }),
      ]);
    } else {
      await prisma.offerwallCallback.create({
        data: {
          userId,
          offerwallId: config.id,
          offerId,
          offerName,
          transactionId,
          payoutAmount,
          userPayout,
          status: "PENDING",
          ipAddress: ip,
          rawPayload: JSON.parse(JSON.stringify({ ...Object.fromEntries(url.searchParams), ...body })),
        },
      });
    }
  } catch (err) {
    // Unique violation on transactionId → provider retry; already handled.
    if ((err as { code?: string })?.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ error: "Callback failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, credited: autoCredit ? userPayout : 0 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return handle(request, provider);
}
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  return handle(request, provider);
}
