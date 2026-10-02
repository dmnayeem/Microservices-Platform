import { NextRequest, NextResponse } from "next/server";
import { financeGuard, reply, auditFinance } from "@/lib/company-finance/api";
import {
  cancelSubscription,
  renewSubscription,
  saveSubscription,
  type RenewInput,
  type SubscriptionInput,
} from "@/lib/company-finance/subscriptions";

export const runtime = "nodejs";

/** Edit a subscription. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as SubscriptionInput;
  const res = await saveSubscription(id, g.caller.id, body);
  if (res.ok) {
    await auditFinance(g.caller, "SUBSCRIPTION_EDITED", "CompanySubscription", id, `Edited subscription "${body.name}"`);
  }
  return reply(res);
}

/** `{ action: "renew", ... }` or `{ action: "cancel" }`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await financeGuard("finance.entries.create");
  if ("res" in g) return g.res;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as RenewInput & { action?: string };

  if (body.action === "cancel") {
    const res = await cancelSubscription(id);
    if (res.ok) {
      await auditFinance(g.caller, "SUBSCRIPTION_CANCELLED", "CompanySubscription", id, `Cancelled subscription "${res.data.name}"`);
    }
    return reply(res);
  }

  if (body.action === "renew") {
    // Same rule as recording any entry: "record" alone writes it PENDING.
    if (body.createExpense && body.markPaid && !g.caller.can("finance.entries.approve")) {
      return NextResponse.json(
        { error: "You can record the renewal, but marking it paid needs the 'Approve & pay expenses' permission." },
        { status: 403 }
      );
    }
    const res = await renewSubscription(id, g.caller.id, body);
    if (res.ok) {
      await auditFinance(g.caller, "SUBSCRIPTION_RENEWED", "CompanySubscription", id,
        `Renewed "${res.data.name}" to ${res.data.endDate}${res.data.entryId ? ` — expense ${body.amount} ${body.currency}` : ""}`,
        { entryId: res.data.entryId });
    }
    return reply(res);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
