import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import {
  dueSoonCount,
  listSubscriptions,
  saveSubscription,
  type SubscriptionInput,
} from "@/lib/company-finance/subscriptions";
import { SUBSCRIPTIONS_NOT_READY } from "@/lib/company-finance/subscriptions-shared";

export const runtime = "nodejs";

/**
 * Company subscriptions & renewals. `?hint=1` answers only the overview's
 * "N renewals due in 7 days" — one count, not the whole list.
 */
export async function GET(request: NextRequest) {
  const g = await financeGuard("finance.view");
  if ("res" in g) return g.res;
  if (request.nextUrl.searchParams.get("hint")) {
    const due7 = await dueSoonCount(7);
    return NextResponse.json({ ready: due7 !== null, due7: due7 ?? 0 });
  }
  const data = await listSubscriptions();
  if (!data.ready) return NextResponse.json({ ready: false, message: SUBSCRIPTIONS_NOT_READY });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const body = (await request.json().catch(() => ({}))) as SubscriptionInput;
  const res = await saveSubscription(null, g.caller.id, body);
  if (res.ok) {
    await auditFinance(g.caller, "SUBSCRIPTION_CREATED", "CompanySubscription", res.data.id,
      `Started tracking subscription "${body.name}" (${body.category}, ${body.billingCycle})`);
  }
  return reply(res, 201);
}
