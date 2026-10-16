import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { approvePromotion, rejectPromotion } from "@/lib/promotion-review";

/**
 * POST /api/admin/promotions/:id { action: "approve" | "reject", reason? } —
 * the admin decision on a member's paid course / listing promotion. Status,
 * featuring, refunds, the member's notification and the audit row all happen
 * in src/lib/promotion-review.ts; this route only gates and reports.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId || !(await can(adminId, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };

  if (body.action === "approve") {
    const r = await approvePromotion(id, adminId);
    if (r.ok) return NextResponse.json({ ok: true, status: "APPROVED", featuredUntil: r.endsAt.toISOString() });
    if (r.code === "NOT_FOUND") return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    if (r.code === "WITHDRAWN") {
      return NextResponse.json(
        {
          error:
            "The item is no longer published or active, so it can't be featured. The promotion was cancelled and the member refunded.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "This promotion has already been decided — reload to see its current state." },
      { status: 409 }
    );
  }

  if (body.action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (reason.length < 3) {
      return NextResponse.json({ error: "Write the reason the member will see." }, { status: 400 });
    }
    const done = await rejectPromotion(id, adminId, reason);
    if (!done) {
      return NextResponse.json(
        { error: "This promotion has already been decided — reload to see its current state." },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      status: "REJECTED",
      refund: done.refund ? { from: done.refund.from, adPoints: done.refund.adPoints, usd: done.refund.usd } : null,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
