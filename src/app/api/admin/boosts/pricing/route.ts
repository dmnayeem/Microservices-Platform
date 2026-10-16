import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { BOOST_PRICING_KEY, normalizeBoostPricing } from "@/lib/boost/pricing";

/**
 * PUT /api/admin/boosts/pricing { pricing } — boost prices per event and per
 * country, budget / duration limits, review switch, per-viewer cap.
 *
 * Saved only in its normalized shape, so the feed, the charge path and the
 * member's estimate all read the same clean object. settings.edit, like every
 * other platform setting.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId || !(await can(adminId, "settings.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { pricing?: unknown } | null;
  if (!body?.pricing || typeof body.pricing !== "object") {
    return NextResponse.json({ error: "Missing pricing" }, { status: 400 });
  }
  const pricing = normalizeBoostPricing(body.pricing);
  await saveSetting(BOOST_PRICING_KEY, pricing, "ads");
  await writeAudit({
    actorId: adminId,
    action: "BOOST_PRICING_UPDATED",
    entity: "SystemSetting",
    entityId: BOOST_PRICING_KEY,
    summary: `Updated post boost pricing (${Object.keys(pricing.countries).length} country override${
      Object.keys(pricing.countries).length === 1 ? "" : "s"
    }, review ${pricing.requireReview ? "on" : "off"})`,
    meta: { pricing },
  });
  return NextResponse.json({ ok: true, pricing });
}
