import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { userCanFeature } from "@/lib/packages";
import { getBuyerSettings } from "@/lib/buyer-settings";
import { purchaseTaskCredit } from "@/lib/task-credit";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { usd } from "@/lib/utils";

/**
 * Buy task credit with Ad Fund or Ad Points (owner, 2026-10-16 — no longer
 * wallet cash).
 *
 * Money moves here, so it is rate-limited in the DATABASE rather than in
 * memory: the in-memory limiter keeps one counter per serverless instance, and
 * the platform adds instances under exactly the load an attacker generates.
 */
const schema = z.object({
  points: z.number().int().min(1).max(1_000_000_000),
  paySource: z.enum(["AD_POINTS", "AD_FUND"]).default("AD_FUND"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const limited = await enforceDbRateLimit(req, "buypoints", userId, 10, 60_000);
  if (limited) return limited;

  const buyer = await getBuyerSettings();
  if (!buyer.enabled) {
    return NextResponse.json(
      { error: "Buyer task creation is currently turned off." },
      { status: 403 }
    );
  }
  // Task credit exists only to fund tasks, so an account that cannot create
  // tasks has nothing to spend it on. Selling it to them would be selling
  // something unusable.
  if (!(await userCanFeature(userId, "createTasks"))) {
    return NextResponse.json(
      { error: "Task creation isn't enabled for your account." },
      { status: 403 }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid amount" },
      { status: 400 }
    );
  }

  const result = await purchaseTaskCredit(userId, parsed.data.points, {
    minPoints: buyer.minPurchasePoints,
    maxPoints: buyer.maxPurchasePoints,
    from: parsed.data.paySource,
  });

  if (!result.ok) {
    if (result.reason === "TOO_SMALL") {
      return NextResponse.json(
        {
          error: `The smallest purchase is ${buyer.minPurchasePoints.toLocaleString()} points.`,
        },
        { status: 400 }
      );
    }
    if (result.reason === "TOO_LARGE") {
      return NextResponse.json(
        {
          error: `You can buy at most ${buyer.maxPurchasePoints.toLocaleString()} points at a time.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: result.message ?? `Not enough balance — you need ${usd(result.shortByUsd ?? 0)} more.`,
        shortByUsd: result.shortByUsd ?? 0,
        depositHref: result.addFund ?? "/deposit",
        addFund: result.addFund ?? "/deposit",
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    success: true,
    points: result.points,
    costUsd: result.costUsd,
    balance: result.newBalance,
  });
}
